/* <robot-viewport mode="live|stale|offline"> — primitive humanoid driven by a joint tree.
   Orbit / pan / zoom, reset, visual+collision+frame toggles, click-to-select link. */
(function () {
  function whenThree(cb) {
    if (window.THREE) return cb(window.THREE);
    var start = Date.now();
    var t = setInterval(function () {
      if (window.THREE) { clearInterval(t); cb(window.THREE); }
      else if (Date.now() - start > 20000) clearInterval(t);
    }, 50);
  }

  var BODY = 0x78838f, JOINTC = 0x3d4650, ACC = 0x4493f8;

  class RobotViewport extends HTMLElement {
    static get observedAttributes() { return ['mode']; }
    attributeChangedCallback() { if (this._apply) this._apply(); }
    get mode() { return this.getAttribute('mode') || 'live'; }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = '100%';
      this.style.overflow = 'hidden';
      this._overlay();
      whenThree(this._boot.bind(this));
    }
    disconnectedCallback() { this._stop = true; if (this._ro) this._ro.disconnect(); }

    _overlay() {
      var bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:6px;left:6px;z-index:3;display:flex;flex-wrap:wrap;gap:3px;font:500 9px/1 "IBM Plex Mono",monospace;max-width:calc(100% - 12px)';
      var self = this;
      var mk = function (label, toggle, on) {
        var b = document.createElement('button');
        b.textContent = label;
        b.dataset.on = on ? '1' : '0';
        b.style.cssText = 'cursor:pointer;padding:4px 6px;border-radius:3px;border:1px solid #2f3640;white-space:nowrap;background:' +
          (on ? 'rgba(68,147,248,.16)' : 'rgba(12,14,16,.72)') + ';color:' + (on ? '#8fc0ff' : '#98a2ad') +
          ';letter-spacing:.04em;text-transform:uppercase;backdrop-filter:blur(4px)';
        b.onclick = function () {
          if (!toggle) { self._reset && self._reset(); return; }
          var next = b.dataset.on !== '1';
          b.dataset.on = next ? '1' : '0';
          b.style.background = next ? 'rgba(68,147,248,.16)' : 'rgba(12,14,16,.72)';
          b.style.color = next ? '#8fc0ff' : '#98a2ad';
          self._toggle && self._toggle(toggle, next);
        };
        bar.appendChild(b);
        return b;
      };
      mk('reset', null, false);
      mk('visual', 'visual', true);
      mk('collision', 'collision', false);
      mk('frames', 'frames', false);
      this.appendChild(bar);

      var lbl = document.createElement('div');
      lbl.style.cssText = 'position:absolute;bottom:8px;left:8px;z-index:3;font:500 10px/1.5 "IBM Plex Mono",monospace;color:#6b757f;background:rgba(12,14,16,.72);padding:5px 7px;border-radius:3px;border:1px solid #24292e';
      lbl.textContent = 'click a link to select';
      this._lbl = lbl;
      this.appendChild(lbl);

      var off = document.createElement('div');
      off.style.cssText = 'position:absolute;inset:0;z-index:2;display:none;align-items:center;justify-content:center;background:rgba(12,14,16,.62);backdrop-filter:blur(2px)';
      off.innerHTML = '<div style="text-align:center;font:500 11px/1.6 \'IBM Plex Mono\',monospace;color:#d29922;letter-spacing:.04em"><div style="font-size:18px;line-height:1">&#9888;</div>no_state_received<div style="color:#6b757f;text-transform:none;letter-spacing:0;font-family:\'IBM Plex Sans\',sans-serif;font-size:11px;margin-top:4px">Model shown at URDF zero pose</div></div>';
      this._off = off;
      this.appendChild(off);
    }

    _boot(T) {
      var host = this;
      var scene = new T.Scene();
      var cam = new T.PerspectiveCamera(38, 1, 0.05, 100);
      var renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      var cv = renderer.domElement;
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
      this.insertBefore(cv, this.firstChild);

      scene.add(new T.HemisphereLight(0xbcd0e4, 0x14181c, 0.85));
      var d1 = new T.DirectionalLight(0xffffff, 0.9); d1.position.set(2.4, 3.2, 1.8); scene.add(d1);
      var d2 = new T.DirectionalLight(0x6f8ba8, 0.4); d2.position.set(-2, 1.2, -2.4); scene.add(d2);

      var grid = new T.GridHelper(4, 20, 0x2a3138, 0x1b2126);
      grid.material.transparent = true; grid.material.opacity = 0.9;
      scene.add(grid);

      // ---- robot: nested joint groups ----
      var joints = {}, meshes = [], collision = new T.Group(), frames = new T.Group(), visual = new T.Group();
      collision.visible = false; frames.visible = false;
      scene.add(collision, frames, visual);

      var mat = function () { return new T.MeshStandardMaterial({ color: BODY, metalness: 0.25, roughness: 0.55 }); };
      var box = function (parent, name, w, h, d, drop) {
        var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat());
        m.name = name; m.position.y = drop === undefined ? -h / 2 : drop;
        parent.add(m); meshes.push(m);
        var wf = new T.Mesh(new T.BoxGeometry(w * 1.12, h * 1.1, d * 1.12),
          new T.MeshBasicMaterial({ color: 0xd29922, wireframe: true, transparent: true, opacity: 0.5 }));
        wf.name = name + '_collision';
        m.add(wf); wf.visible = true; wf.userData.col = true;
        collision.userData.list = collision.userData.list || [];
        collision.userData.list.push(wf);
        return m;
      };
      var joint = function (parent, name, x, y, z) {
        var g = new T.Group(); g.name = name; g.position.set(x, y, z);
        parent.add(g); joints[name] = g;
        var pin = new T.Mesh(new T.SphereGeometry(0.028, 12, 10), new T.MeshStandardMaterial({ color: JOINTC, roughness: 0.4 }));
        pin.name = name; g.add(pin); meshes.push(pin);
        var ax = new T.AxesHelper(0.11); ax.userData.frameFor = g; frames.userData.list = frames.userData.list || []; frames.userData.list.push(ax);
        g.add(ax);
        return g;
      };

      var root = new T.Group(); visual.add(root);
      var pelvis = joint(root, 'pelvis', 0, 0.86, 0);
      box(pelvis, 'pelvis_link', 0.30, 0.14, 0.20, 0);
      var waist = joint(pelvis, 'waist_yaw', 0, 0.09, 0);
      box(waist, 'torso_link', 0.34, 0.40, 0.22, 0.20);
      var neck = joint(waist, 'neck', 0, 0.44, 0);
      box(neck, 'head_link', 0.17, 0.17, 0.18, 0.09);
      var visor = new T.Mesh(new T.BoxGeometry(0.13, 0.045, 0.02), new T.MeshStandardMaterial({ color: ACC, emissive: 0x123a6b, roughness: 0.3 }));
      visor.position.set(0, 0.09, 0.10); visor.name = 'head_camera'; neck.add(visor); meshes.push(visor);

      [['left', 1], ['right', -1]].forEach(function (s) {
        var side = s[0], k = s[1];
        var sh = joint(waist, side + '_shoulder_pitch', k * 0.215, 0.33, 0);
        box(sh, side + '_upper_arm', 0.085, 0.26, 0.085);
        var el = joint(sh, side + '_elbow', 0, -0.27, 0);
        box(el, side + '_lower_arm', 0.072, 0.24, 0.072);
        var wr = joint(el, side + '_wrist', 0, -0.25, 0);
        box(wr, side + '_hand', 0.07, 0.10, 0.05);
        var hip = joint(pelvis, side + '_hip_pitch', k * 0.098, -0.08, 0);
        box(hip, side + '_thigh', 0.10, 0.32, 0.10);
        var kn = joint(hip, side + '_knee', 0, -0.33, 0);
        box(kn, side + '_shin', 0.088, 0.30, 0.088);
        var an = joint(kn, side + '_ankle_pitch', 0, -0.31, 0);
        box(an, side + '_foot', 0.10, 0.045, 0.22, -0.02);
      });

      (collision.userData.list || []).forEach(function (wf) { collision.add; });
      // collision wireframes live under their mesh; drive them by group flag
      var colList = collision.userData.list || [], frameList = frames.userData.list || [];
      colList.forEach(function (w) { w.visible = false; });
      frameList.forEach(function (a) { a.visible = false; });

      // ---- camera controls ----
      var target = new T.Vector3(0, 0.85, 0);
      var home = { az: 0.62, pol: 1.24, dist: 3.15, target: target.clone() };
      var az = home.az, pol = home.pol, dist = home.dist;
      var place = function () {
        cam.position.set(
          target.x + dist * Math.sin(pol) * Math.sin(az),
          target.y + dist * Math.cos(pol),
          target.z + dist * Math.sin(pol) * Math.cos(az)
        );
        cam.lookAt(target);
      };
      place();

      var drag = null;
      cv.addEventListener('pointerdown', function (e) {
        cv.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: 0 };
        cv.style.cursor = 'grabbing';
      });
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      cv.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.pan) {
          var right = new T.Vector3().subVectors(cam.position, target).cross(new T.Vector3(0, 1, 0)).normalize();
          target.addScaledVector(right, -dx * dist * 0.0012);
          target.y += dy * dist * 0.0012;
        } else {
          az -= dx * 0.007;
          pol = Math.max(0.18, Math.min(2.6, pol - dy * 0.007));
        }
        place();
      });
      cv.addEventListener('pointerup', function (e) {
        var wasClick = drag && drag.moved < 4 && !drag.pan;
        drag = null; cv.style.cursor = 'grab';
        if (wasClick) pick(e);
      });
      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        dist = Math.max(0.9, Math.min(9, dist * (1 + Math.sign(e.deltaY) * 0.09)));
        place();
      }, { passive: false });

      var ray = new T.Raycaster(), selected = null;
      function selectMesh(m) {
        if (selected) { if (selected.material.emissive) selected.material.emissive.setHex(0x000000); selected = null; }
        if (m) {
          selected = m;
          if (selected.material.emissive) selected.material.emissive.setHex(0x1b3f6d);
          host._lbl.textContent = 'selected  ' + selected.name;
          host._lbl.style.color = '#8fc0ff';
          host.dispatchEvent(new CustomEvent('linkselect', { detail: { name: selected.name }, bubbles: true }));
        } else {
          host._lbl.textContent = 'click a link to select';
          host._lbl.style.color = '#6b757f';
        }
      }
      function pick(e) {
        var r = cv.getBoundingClientRect();
        ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
        var hit = ray.intersectObjects(meshes, false)[0];
        selectMesh(hit ? hit.object : null);
      }

      this._reset = function () { az = home.az; pol = home.pol; dist = home.dist; target.copy(home.target); host._anim = null; place(); };
      this.focusJoint = function (name) {
        var g = joints[name];
        if (!g) return;
        var wp = new T.Vector3(); g.getWorldPosition(wp);
        host._anim = { t0: performance.now(), dur: 550, fromTarget: target.clone(), toTarget: wp.clone(), fromDist: dist, toDist: 0.95 };
        var m = meshes.filter(function (mm) { return mm.name === name; })[0];
        selectMesh(m || null);
      };
      this._toggle = function (kind, on) {
        if (kind === 'visual') visual.visible = on;
        if (kind === 'collision') colList.forEach(function (w) { w.visible = on; });
        if (kind === 'frames') frameList.forEach(function (a) { a.visible = on; });
      };

      var dimmed = false;
      this._apply = function () {
        var m = host.mode;
        host._off.style.display = m === 'offline' ? 'flex' : 'none';
        var want = m !== 'live';
        if (want !== dimmed) {
          dimmed = want;
          meshes.forEach(function (mesh) {
            if (!mesh.material.color) return;
            mesh.material.opacity = want ? 0.55 : 1;
            mesh.material.transparent = want;
          });
        }
      };
      this._apply();

      var ro = new ResizeObserver(function () {
        var w = host.clientWidth || 1, h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        cam.aspect = w / h; cam.updateProjectionMatrix();
      });
      ro.observe(this); this._ro = ro;

      var pose = function (t) {
        joints.waist_yaw.rotation.y = 0.12 * Math.sin(t * 0.5);
        [['left', 0], ['right', Math.PI]].forEach(function (s) {
          var n = s[0], ph = s[1];
          joints[n + '_shoulder_pitch'].rotation.x = -0.30 + 0.35 * Math.sin(t * 0.8 + ph);
          joints[n + '_elbow'].rotation.x = -0.50 + 0.40 * Math.sin(t * 0.8 + 0.6 + ph);
          joints[n + '_hip_pitch'].rotation.x = 0.10 * Math.sin(t * 0.6 + ph);
          joints[n + '_knee'].rotation.x = 0.35 + 0.20 * Math.sin(t * 0.6 + 0.4 + ph);
          joints[n + '_ankle_pitch'].rotation.x = -0.12 * Math.sin(t * 0.6 + ph);
        });
      };
      var frozen = 0;
      var loop = function () {
        if (host._stop) return;
        requestAnimationFrame(loop);
        if (host._anim) {
          var a = host._anim, tt = Math.min(1, (performance.now() - a.t0) / a.dur), ease = 1 - Math.pow(1 - tt, 3);
          target.lerpVectors(a.fromTarget, a.toTarget, ease);
          dist = a.fromDist + (a.toDist - a.fromDist) * ease;
          place();
          if (tt >= 1) host._anim = null;
        }
        var m = host.mode;
        pose(m === 'live' ? performance.now() / 1000 : (m === 'stale' ? frozen : 0));
        if (m === 'offline') { joints.waist_yaw.rotation.y = 0; }
        renderer.render(scene, cam);
      };
      loop();
    }
  }

  if (!customElements.get('robot-viewport')) customElements.define('robot-viewport', RobotViewport);
})();
