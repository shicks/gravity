(function() {

  var svg = document.getElementById('svg');

  var createSvg = function(type, parent) {
    var elt = document.createElementNS("http://www.w3.org/2000/svg", type);
    parent.appendChild(elt);
    return elt;
  };

  // Returns the zero of the function (given its derivative)
  var newtonRaphson = function(f, fprime, tol, x0) {
    tol = tol || 1e-10;
    x0 = x0 || 0;
    if (isNaN(x0)) return x0;
    var y0 = f(x0);
    if (Math.abs(y0) < tol) return x0;
    var yp0 = fprime(x0);
    var x1 = x0 - y0/yp0; // use successive over-relaxation
    //window.console.log('x=' + x0 + ', f(x)=' + y0 + ", f'(x)=" + yp0);
    return newtonRaphson(f, fprime, tol, 0.2 * x0 + 0.8 * x1);
  };

  // Returns the zero of the function (ignores the derivative)
  var binarySearch = function(f, _, tol) {
    tol = tol || 1e-10;
    var x0 = -1;
    var x1 = 1;
    var y0, y1, xm, ym;
    do { // bracket the root.
      x0 *= 2;
      x1 *= 2;
      y0 = f(x0);
      y1 = f(x1);
    } while (y0 * y1 > 0);
    do {
      // First do a normal bisection
      xm = (x0 + x1) / 2;
      ym = f(xm);
      if (ym * y0 > 0) {
        x0 = xm;
        y0 = ym;
      } else {
        x1 = xm;
        y1 = ym;
      }
      // Then do a weighted one
      xm = x0 - y0 / (y1 - y0) * (x1 - x0);
      ym = f(xm);
      if (ym * y0 > 0) {
        x0 = xm;
        y0 = ym;
      } else {
        x1 = xm;
        y1 = ym;
      }
    } while (Math.abs(ym) > tol && (x1-x0) > tol);
    return xm;
  };

  var fsolve = binarySearch;

  var cosh = function(x) {
    return (Math.exp(x) + Math.exp(-x)) / 2;
  };

  var sinh = function(x) {
    return (Math.exp(x) - Math.exp(-x)) / 2;
  };

  var atanh = function(x) {
    return 0.5 * Math.log((1 - x) / (1 + x));
  };

  var clock = (function() {
    var time = 0;
    var speed = 0.3;
    var realTime = null;
    var running = false;
    var listeners = [];
    var delay = 18;

    var iterate = function() {
      if (!running || realTime == null) return;
      running = false;
      var nextRealTime = new Date().getTime();
      time += speed * (nextRealTime - realTime);
      realTime = nextRealTime;
      listeners.forEach(function(listener) {
        listener(time);
      });
      window.setTimeout(iterate, delay);
      running = true;
    };

    var control = {
      start: function() {
        if (running) return;
        running = true;
        realTime = new Date().getTime();
        window.setTimeout(iterate, delay);
      },
      stop: function() {
        running = false;
        realTime = null;
      },
      pause: function() {
        if (!running) control.start();
        else control.stop();
      },
      setSpeed: function(newSpeed) {
        speed = newSpeed;
      },
      getSpeed: function() {
        return speed;
      },
      getTime: function() {
        return time;
      },
      addListener: function(listener) {
        listeners.push(listener);
      }
    };

    control.start();
    return control;
  })();

  // Used for keeping track of the objects on the canvas,
  // the size of the view window, and the orbital coordinates.
  // Objects must expose width(), height(), and redraw(fx, fy, fs, t)
  // methods, where fx and fy are functions transforming the
  // orbital coordinates to pixel coordinates, fs transforms
  // relative distances, and t is the time.
  var view = (function() {
    var group = document.getElementById('view');
    var objects = [];
    var control = {
      redraw: function() {
        // determine the scale factor
        var sceneWidth = objects.reduce(function(v, o) {
          return Math.max(v, o.width());
        }, 0);
        var sceneHeight = objects.reduce(function(v, o) {
          return Math.max(v, o.height());
        }, 0);
        var docWidth = svg.offsetWidth;
        var docHeight = svg.offsetHeight;
        var scale = Math.min(docWidth / sceneWidth,
                             docHeight / sceneHeight);
        // only want discrete scales (rather than always zooming)
        scale = Math.exp(Math.floor(2 * Math.log(scale)) / 2);
        // fix the group transform
        var cx = docWidth / 2;
        var cy = docHeight / 2;
        group.transform.baseVal.getItem(0).setTranslate(cx, cy);
        group.transform.baseVal.getItem(1).setScale(scale, scale);
      },
      add: function(obj) {
        objects.push(obj);
      }      
    };
    return control;
  })();

  var createOrbit = function(id, satId) {
    // SVG element
    var orbit = document.getElementById(id);
    var sat = document.getElementById(satId);
    var satRadius = 2;

    // The orbit has three parameters
    var l = 0;  // angular momentum: l = r^2 \dot{theta}
    var e = 0;  // eccentricity: e^2 = \dot{r}^2 l^2 + l^4/r^2 - 2l^2/r + 1
    var theta0 = 0;  // angle theta0 of the periapsis relative to the x axis

    // The position in the orbit is tracked by the millisecond timestamp
    // of periapsis.  For ellipses (and circles), this is a periodic
    // occurrence, with period 2*pi*a^(3/2), so we need to factor this in
    // to any calculations of the eccentric anomaly used to compute the
    // current position.
    var T = 0;

    // The current time and position.
    var t = 0;
    var x, y, vx, vy;
    var angle = 0; // relative to "forward" (i.e. tangential)
                   // TODO: expose different steering options

    // Derived orbital parameters (for ellipse/hyperbola).
    var a, b, cx, cy;

    var isEllipse = function() { return e < 1; };
    var asEllipse = function() { // assumes isEllipse
      // Semimajor axis a = l^2 / (1 - e^2)
      var a = l*l / (1 - e*e);
      // Semiminor axis b = a * sqrt(1 - e^2)
      var b = a * Math.sqrt(1 - e*e);
      // Center of the ellipse
      return {a: a, b: b, cx: cx, cy: cy};
    };

    var drawEllipse = function(x0, y0) {
      // Recompute params
      a = l*l / (1 - e*e);
      b = a * Math.sqrt(1 - e*e);
      var E = Math.atan2(y0 / b, x0 / a + e);
      var time1 = a*Math.sqrt(a) * (E - e * Math.sin(E));
      T = t - time1;
      cx = -a * e * Math.cos(theta0);
      cy = -a * e * Math.sin(theta0);
      // Update element
      orbit.cx.baseVal.value = cx;
      orbit.cy.baseVal.value = cy;
      orbit.rx.baseVal.value = a;
      orbit.ry.baseVal.value = b;
      orbit.transform.baseVal.getItem(0).
          setRotate(theta0 * 180 / Math.PI, cx, cy);
      orbit.style.display = 'inline';
    };

    var drawParabola = function(theta1) {
      var D = Math.tan(theta1 / 2);
      T = t - (l*l*l*D/2)*(1 + D*D/3);
      orbit.style.display = 'none';
      // TODO(sdh): approximate the conic by iterating over D
    };

    var drawHyperbola = function(x0, y0) {
      a = l*l / (e*e - 1);
      b = a * Math.sqrt(e*e - 1);
      var E = atanh((y0 / b) / (e - x0 / a));
      var time1 = a*Math.sqrt(a) * (E - e * Math.sin(E));
      T = t - time1;
      orbit.style.display = 'none';
    };

    var solveEllipse = function() {
      var E = fsolve(
          function(E) {
            return a*Math.sqrt(a) * (E - e*Math.sin(E)) - (t - T);
          }, function(E) {
            return a*Math.sqrt(a) * (1 - e*Math.cos(E));
          });
      var Edot = 1 / (a*Math.sqrt(a) * (1 - e*Math.cos(E)));
      x = a * (Math.cos(E) - e);
      y = b * Math.sin(E);
      vx = -a * Math.sin(E) * Edot;
      vy = b * Math.cos(E) * Edot;
    };

    var solveHyperbola = function() {
      var E = fsolve(
          function(E) {
            return a*Math.sqrt(a) * (e*sinh(E) - E) - (t - T);
          }, function(E) {
            return a*Math.sqrt(a) * (e*cosh(E) - 1);
          });
      var Edot = 1 / (a*Math.sqrt(a) * (e*cosh(E) - 1));
      x = a * (e - cosh(E));
      y = b * sinh(E);
      vx = -a * sinh(E) * Edot;
      vy = b * cosh(E) * Edot;
    };

    var solveParabola = function() {
      // parabolas are weird (Barker's equation)
      var D = fsolve(
          function(D) {
            return l*l*l/2 * (D + D*D*D/3) - (t - T);
          }, function(D) {
            return l*l*l/2 * (1 + D*D);
          });
      x = l*l / 2 * (1 - D*D);
      y = l*l * D;
      vy = 2 / (l * (1 + D*D));
      vx = vy * D;
    };

    var rotateSolution = function() {
      // Transform by the rotation theta0
      var ct = Math.cos(theta0);
      var st = Math.sin(theta0);
      var r = {
        x: x * ct - y * st,
        y: y * ct + x * st,
        vx: vx * ct - vy * st,
        vy: vy * ct + vx * st
      };
      x = r.x; y = r.y; vx = r.vx; vy = r.vy;
    };

    var redrawSatellite = function() {
      var forward = Math.atan2(vy, vx) * 180 / Math.PI + angle;
      sat.transform.baseVal.getItem(0).setTranslate(x, y);
      sat.transform.baseVal.getItem(1).setRotate(forward, 0, 0);
    };

    // Build the API
    var control = {
      width: function() {
        return (e < 1 ? 2*a : control.radius()) + satRadius;
      },
      height: function() {
        return (e < 1 ? 2*a : control.radius()) + satRadius;
      },
      radius: function() {
        return Math.max(Math.abs(x), Math.abs(y));
      },
      position: function() {
        return {x: x, y: y, vx: vx, vy: vy};
      },
      // Returns the position {x, y, vx, vy}.
      advance: function(new_time) {
        t = new_time;
        // First we need to compute the eccentric anomaly, E, which
        // requires a numerical solution to a transcendental equation.
        if (e < 1) {
          solveEllipse();
        } else if (e > 1) {
          solveHyperbola();
        } else { // e == 1
          solveParabola();
        }
        rotateSolution(); // rotates by theta0
        redrawSatellite();
      },
      reset: function(x, y, vx, vy) {
        // First transform to radial coords.
        var r = Math.sqrt(x*x + y*y);
        if (r == 0) return; // crash - do nothing...
        var theta = Math.atan2(y, x);
        var ct = x/r;
        var st = y/r;
        var vr = vx * ct + vy * st; // rotate by -theta
        var vt = Math.abs(vy * ct - vx * st) / r;
        l = r*r*vt;
        var ey = l*vr;
        var ex = l*r*vt - 1;
        e = Math.sqrt(ex*ex + ey*ey);
        if (e == 0) {
          theta0 = theta;
          //T = t0;
          drawEllipse(0, 0);
          return;
        }
        var theta1 = Math.atan2(ey, ex); // true anomaly (theta - theta0)
        theta0 = theta - theta1;
        if (e == 1) {
          drawParabola(theta1);
          return;
        }
        var ct0 = Math.cos(theta0);
        var st0 = Math.sin(theta0);
        var x0 = x * ct0 + y * st0; // rotate by -theta0
        var y0 = y * ct0 - x * st0; // (x0, y0) is coords in aligned frame
        if (e < 1) {
          drawEllipse(x0, y0);
        } else { // e > 1
          drawHyperbola(x0, y0);
        }
      },
      turn: function(angle_change) {
        angle += angle_change;
      },
      thrust: function(speed_change, extra_angle) {
        extra_angle = extra_angle || 0;
        var dir = Math.atan2(vy, vx) +
                  (angle + extra_angle) * Math.PI / 180;
        control.reset(x, y, vx + speed_change * Math.cos(dir),
                            vy + speed_change * Math.sin(dir));
      }
    };
    return control;
  };

  var planet = (function() {
    var elem = document.getElementById('planet');
    return {
      width: function() { return elem.r.baseVal.value; },
      height: function() { return elem.r.baseVal.value; }
    };      
  })();
  view.add(planet);

  var target = createOrbit('target-orbit', 'target-circle');
  target.reset(50, 0, 0, -0.15);
  view.add(target);

  var ship = createOrbit('current-orbit', 'current-ship');
  ship.reset(40, 0, 0, -0.15);
  view.add(ship);

  document.body.onkeydown = function(e) {
    var shift = e.shiftKey ? 0.10 : 1;
    if (e.keyCode == 37 || e.keyCode == 65) { // left (a)
      ship.turn(-10 * shift);
    } else if (e.keyCode == 39 || e.keyCode == 68) { // right (d)
      ship.turn(10 * shift);
    } else if (e.keyCode == 38 || e.keyCode == 87) { // up (w)
      ship.thrust(0.0025 * shift);
    } else if (e.keyCode == 40 || e.keyCode == 83) { // down (s)
      ship.thrust(-0.0025 * shift);
    } else if (e.keyCode == 81) { // strafe left (q)
      ship.thrust(0.0025 * shift, 270);
    } else if (e.keyCode == 69) { // strafe right (e)
      ship.thrust(0.0025 * shift, 90);
    } else if (e.keyCode == 187 && e.shiftKey) { // speed up (+)
      clock.setSpeed(clock.getSpeed() * 1.1);
    } else if (e.keyCode == 187) { // default speed (=)
      clock.setSpeed(0.3);
    } else if (e.keyCode == 189) { // speed down (-)
      clock.setSpeed(clock.getSpeed() / 1.1);
    } else if (e.keyCode == 32) { // space
      clock.pause();
    }
  };

  clock.addListener(ship.advance);
  clock.addListener(target.advance);
  clock.addListener(view.redraw);
  clock.start();
})();

/*
(load-file "~/Downloads/js2-mode.elc")
(custom-set-variables  
  '(js2-basic-offset 2)  
  '(js2-bounce-indent-p t)  
)
*/
