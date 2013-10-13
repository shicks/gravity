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

  // Used for keeping track of the objects on the canvas,
  // the size of the view window, and the orbital coordinates.
  // Objects must expose width(), height(), and redraw(fx, fy, fs, t)
  // methods, where fx and fy are functions transforming the
  // orbital coordinates to pixel coordinates, fs transforms
  // relative distances, and t is the time.
  var view = (function() {
    var objects = [];
    var control = {
      redraw: function(t) {
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
        scale = Math.exp(Math.floor(Math.log(scale)));
        // redraw everything
        var cx = docWidth / 2;
        var cy = docHeight / 2;
        var fx = function(x) { return x * scale + cx; };
        var fy = function(y) { return y * scale + cy; };
        var fs = function(s) { return s * scale; };
        objects.forEach(function(o) { o.redraw(fx, fy, fs, t); });
      },
      add: function(obj) {
        objects.push(obj);
      }
    };
    return control;
  })();

  var createOrbit = function(parent) {
    // SVG element
    var orbit = createSvg('ellipse', parent);
    orbit.style.stroke = '#aaa';
    orbit.style.strokeWidth = 1; // dashed?
    orbit.style.fill = 'none';

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

    var isEllipse = function() { return e < 1; };
    var asEllipse = function() { // assumes isEllipse
      // Semimajor axis a = l^2 / (1 - e^2)
      var a = l*l / (1 - e*e);
      // Semiminor axis b = a * sqrt(1 - e^2)
      var b = a * Math.sqrt(1 - e*e);
      // Center (so that, after rotating theta0, 
      var cx = -a * e * Math.cos(theta0);
      var cy = -a * e * Math.sin(theta0);
      return {a: a, b: b, cx: cx, cy: cy};
    };

    // Build the API
    var control = {
      width: function() {
        return e < 1 ? 2 * l*l / (1 - e*e) : 200;
      },
      height: function() {
        return e < 1 ? 2 * l*l / (1 - e*e) : 200;
      },
      redraw: function(fx, fy, fs, t) {
        if (!isEllipse()) {
          orbit.style.display = 'none';
          return;
        }
        orbit.style.display = 'inline';
        var $ = asEllipse();
        orbit.cx.baseVal.value = fx($.cx);
        orbit.cy.baseVal.value = fy($.cy);
        orbit.rx.baseVal.value = fs($.a);
        orbit.ry.baseVal.value = fs($.b);
        orbit.transform.baseVal.clear();
        var transf = svg.createSVGTransform();
        transf.setRotate(theta0 * 180 / Math.PI, fx($.cx), fy($.cy));
        orbit.transform.baseVal.appendItem(transf);
      },
      // Returns the position {x, y, vx, vy}.
      position: function(t) {
        // First we need to compute the eccentric anomaly, E, which
        // requires a numerical solution to a transcendental equation.

        // TODO(sdh): cache these until a reset
        // then we can call position() with impunity...

        var a, b, x, y, vx, vy, E, Edot; // note: not transformed by theta0 yet
        if (e < 1) {
          a = l*l / (1 - e*e);
          b = a * Math.sqrt(1 - e*e);
          E = fsolve(
              function(E) {
                return a*Math.sqrt(a) * (E - e*Math.sin(E)) - (t - T);
              }, function(E) {
                return a*Math.sqrt(a) * (1 - e*Math.cos(E));
              });
          Edot = 1 / (a*Math.sqrt(a) * (1 - e*Math.cos(E)));
          x = a * (Math.cos(E) - e);
          y = b * Math.sin(E);
          vx = -a * Math.sin(E) * Edot;
          vy = b * Math.cos(E) * Edot;
        } else if (e > 1) {
          a = l*l / (e*e - 1);
          b = a * Math.sqrt(e*e - 1);
          E = fsolve(
              function(E) {
                return a*Math.sqrt(a) * (e*sinh(E) - E) - (t - T);
              }, function(E) {
                return a*Math.sqrt(a) * (e*cosh(E) - 1);
              });
          Edot = 1 / (a*Math.sqrt(a) * (e*cosh(E) - 1));
          x = a * (e - cosh(E));
          y = b * sinh(E);
          vx = -a * sinh(E) * Edot;
          vy = b * cosh(E) * Edot;
        } else { // e == 1, parabolas are weird (Barker's equation)
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
        }
        // Finally, transform by the rotation theta0 and return the result
        var ct = Math.cos(theta0);
        var st = Math.sin(theta0);
        return {
          x: x * ct - y * st,
          y: y * ct + x * st,
          vx: vx * ct - vy * st,
          vy: vy * ct + vx * st
        };
      },
      reset: function(t, x, y, vx, vy) {
        // First transform to radial coords.
        var r = Math.sqrt(x*x + y*y);
        if (r == 0) return; // crash - do nothing...
        var theta = Math.atan2(y, x);
        var ct = x/r;
        var st = y/r;
        var vr = vx * ct + vy * st; // rotate by -theta
        var vt = (vy * ct - vx * st) / r;
        l = r*r*vt;
        var ey = l*vr;
        var ex = l*r*vt - 1;
        e = Math.sqrt(ex*ex + ey*ey);
        if (e == 0) {
          theta0 = theta;
          T = t0;
          return;
        }
        var theta1 = Math.atan2(ey, ex); // relative position (theta - theta0)
        theta0 = theta - theta1;
        if (e == 1) {
          var D = Math.tan(theta1 / 2);
          T = t - (l*l*l*D/2)*(1 + D*D/3);
          return;
        }
        var time1, E, a, b;
        var ct0 = Math.cos(theta0);
        var st0 = Math.sin(theta0);
        var x0 = x * ct0 + y * st0; // rotate by -theta0
        var y0 = y * ct0 - x * st0; // (x0, y0) is coords in aligned frame
        if (e < 1) {
          a = l*l / (1 - e*e);
          b = a * Math.sqrt(1 - e*e);
          E = Math.atan2(y0 / b, x0 / a + e);
          time1 = a*Math.sqrt(a) * (E - e * Math.sin(E));
        } else { // e > 1
          a = l*l / (e*e - 1);
          b = a * Math.sqrt(e*e - 1);
          E = atanh((y0 / b) / (e - x0 / a));
          time1 = a*Math.sqrt(a) * (E - e * Math.sin(E));
        }
        T = t - time1;
      }
    };
    return control;
  };

  var createSatellite = function(orbit, parent, color) {
    // SVG element
    var circle = createSvg('circle', parent);
    var line = createSvg('line', parent);
    var radius = 3;
    circle.style.fill = color;
    line.style.stroke = 'black';
    line.style.strokeWidth = 1;

    var angle = 0; // relative to "forward" (i.e. tangential)

    // Build the API
    var control = {
      width: function() {
        // TODO: call position on the orbit, but we don't have a time...
        return 0;
      },
      height: function() {
        return 0;
      },
      redraw: function(fx, fy, fs, t) {
        var pos = orbit.position(t);
        circle.cx.baseVal.value = fx(pos.x);
        circle.cy.baseVal.value = fy(pos.y);
        circle.r.baseVal.value = fs(radius);
        var dir = Math.atan2(pos.vy, pos.vx) + angle * Math.PI / 180;
        var dx = radius * Math.cos(dir);
        var dy = radius * Math.sin(dir);
        line.x1.baseVal.value = fx(pos.x - dx);
        line.x2.baseVal.value = fx(pos.x);
        line.y1.baseVal.value = fy(pos.y - dy);
        line.y2.baseVal.value = fy(pos.y);
      },
      turn: function(angle_change, t) {
        angle += angle_change;
        // TODO: redraw
      },
      thrust: function(speed_change, t) {
        var pos = orbit.position(t);
        var dir = Math.atan2(pos.vy, pos.vx) + angle * Math.PI / 180;
        orbit.reset(t, pos.x, pos.y, pos.vx + speed_change * Math.cos(dir),
                                     pos.vy + speed_change * Math.sin(dir));
        // TODO: redraw
      }
    };
    return control;
  };

  var planet = (function() {
    var radius = 10;
    var elem = createSvg('circle', svg);
    elem.style.fill = 'blue';
    elem.style.stroke = 'black';
    elem.style.strokeWidth = 2;
    var control = {
      width: function() { return radius; },
      height: function() { return radius; },
      redraw: function(fx, fy, fs) {
        elem.cx.baseVal.value = fx(0);
        elem.cy.baseVal.value = fy(0);
        elem.r.baseVal.value = fs(radius);
      }
    };
    return control;
  })();

  var target = createOrbit(svg);
  target.reset(0, 50, 0, 0, -0.15);

  view.add(planet);
  view.add(target);
  view.add(createSatellite(target, svg, 'red'));

  var orbit = createOrbit(svg);
  orbit.reset(0, 40, 0, 0, -0.15);
  var self = createSatellite(orbit, svg, 'green');
  view.add(orbit);
  view.add(self);

  var t = 0;

  document.body.onkeydown = function(e) {
    if (e.keyCode == 37) { // left
      self.turn(-10, t);
    } else if (e.keyCode == 39) { // right
      self.turn(10, t);
    } else if (e.keyCode == 38) { // up
      self.thrust(0.0025, t);
    } else if (e.keyCode == 40) { // down
      self.thrust(-0.0025, t);
    }
  };

  var update = function() {
    t += 5;
    view.redraw(t);
    setTimeout(update, 15);
  };
  update();
})();

/*
(load-file "~/Downloads/js2-mode.elc")
(custom-set-variables  
  '(js2-basic-offset 2)  
  '(js2-bounce-indent-p t)  
)
*/
