// SOURCE: https://gist.github.com/C-K-Y/4973299
/*
 * Vanilla JS - Touch Gestures
 * @version 0.1
 * @inspired QuoJS - http://quojs.tapquo.com
 *
 * Supported Gestures: singleTap, doubleTap, hold,
 *      swipe, swiping, swipeLeft, swipeRight, swipeUp, swipeDown,
 *      rotate, rotating, rotateLeft, rotateRight, pinch, pinching,
 *      pinchIn, pinchOut,
 *      drag, dragLeft, dragRight, dragUp, dragDown
 */
(function(window) {
    "use strict";
    
    var document = window.document,
        CURRENT_TOUCH = [],
        FIRST_TOUCH = [],
        GESTURE = {},
        HOLD_DELAY = 650,
        TOUCH_TIMEOUT = 0;

    /**
     * Clear touch timeout
     *
     * @return void
     */
    function clearTimer () {
        if (TOUCH_TIMEOUT) {
            clearTimeout(TOUCH_TIMEOUT);
        }
    }

    /**
     * @param {object} event Event object
     * @return {Array.<object>}
     */
    function getTouchesList (event) {
        var e = event.originalEvent || event;
        return e['touches'] || [e];
    }

    /**
     * @param {Array} touches Touches list
     * @param {number} fingers Count of fingers
     * @return {Array.<{ x: {number}, y: {number} }>}
     */
    function getFingerPosition (touches, fingers) {
        var result = [],
            i = 0;
        touches = touches[0]['targetTouches'] ? touches[0]['targetTouches'] : touches;
        while (i < fingers) {
            result.push({
                x: touches[i].pageX,
                y: touches[i].pageY
            });
            i++;
        }
        return result;
    }

    /**
     * @param {number} x1 Start "X" point
     * @param {number} x2 End "X" point
     * @param {number} y1 Start "Y" point
     * @param {number} y2 End "Y" point
     */
    function getSwipeDirection (x1, x2, y1, y2) {
        if (Math.abs(x1 - x2) >= Math.abs(y1 - y2)) {
            return (x1 - x2 > 0) ? 'Left' : 'Right';
        } else {
            return (y1 - y2 > 0) ? 'Up' : 'Down';
        }
    }

    /**
     * @param {Element} node
     * @return {*}
     */
    function getElementParentIfText (node) {
        return ('tagName' in node) ? node : node['parentNode'];
    }

    /**
     * Calculate rotation angle
     *
     * @param {Array} data
     * @return {number}
     */
    function calcAngle (data) {
        var A = data[0],
            B = data[1],
            angle = Math.atan((B.y - A.y) * -1 / (B.x - A.x)) * (180 / Math.PI);
        return (angle < 0) ? angle + 180 : angle;
    }

    /**
     * Calculate fingers distance
     *
     * @param {Array} data
     * @return {number}
     */
    function calcDistance (data) {
        var A = data[0],
            B = data[1];
        return Math.sqrt((B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y)) * -1;
    }

    /**
     * @return void
     */
    function clean () {
        FIRST_TOUCH = [];
        CURRENT_TOUCH = [];
        GESTURE = {};
        return clearTimer();
    }

    /**
     * @param {string} name Event name
     * @param {object?} props Event properties
     * @return {*}
     */
    function dispatch (name, props) {
        if (GESTURE.el) {
            var e = document.createEvent('Events');
            e.initEvent(name, false, true);
            if (!props) {
                props = {};
            }
            if (CURRENT_TOUCH[0]) {
                props.iniTouch = (GESTURE.fingers > 1 ? FIRST_TOUCH : FIRST_TOUCH[0]);
                props.currentTouch = (GESTURE.fingers > 1 ? CURRENT_TOUCH : CURRENT_TOUCH[0]);
            }
            for (var param in props) {
                if (props.hasOwnProperty(param)) {
                    e[param] = props[param];
                }
            }
            return GESTURE.el.dispatchEvent(e);
        }
    }

    /**
     * @return void
     */
    function hold () {
        if (GESTURE.last && (Date.now() - GESTURE.last >= HOLD_DELAY)) {
            dispatch('hold');
            return clean();
        }
    }

    /**
     * @return {boolean}
     */
    function gestureSwipe () {
        var horizontal,
            vertical;
        if (CURRENT_TOUCH[0]) {
            horizontal = Math.abs(FIRST_TOUCH[0].x - CURRENT_TOUCH[0].x) > 30;
            vertical = Math.abs(FIRST_TOUCH[0].y - CURRENT_TOUCH[0].y) > 30;
            return GESTURE.el && (horizontal || vertical);
        }
        return false;
    }

    /**
     * @return {*}
     */
    function gestureRotation () {
        var angle = parseInt(calcAngle(CURRENT_TOUCH), 10),
            diff = parseInt(GESTURE.initialAngle - angle, 10),
            i,
            symbol;
        if (Math.abs(diff) > 20 || GESTURE.angleDifference !== 0) {
            i = 0;
            symbol = GESTURE.angleDifference < 0 ? '-' : '+';
            while (Math.abs(diff - GESTURE.angleDifference) > 90 && i++ < 10) {
                eval('diff ' + symbol + '= 180;');
            }
            GESTURE.angleDifference = parseInt(diff, 10);
            return dispatch('rotating', {
                angle: GESTURE.angleDifference
            });
        }
    }

    /**
     * @return {*}
     */
    function gesturePinch () {
        var distance = parseInt(calcDistance(CURRENT_TOUCH), 10),
            diff = GESTURE.initialDistance - distance;
        if (Math.abs(diff) > 10) {
            GESTURE.distanceDifference = diff;
            return dispatch('pinching', {
                distance: diff
            });
        }
    }

    /**
     * Touch Start
     *
     * @param {object} event
     * @return {*}
     */
    function start(event) {
        var now = Date.now(),
            delta = now - (GESTURE.last || now),
            fingers,
            touches;

        clearTimer();
        touches = getTouchesList(event);
        fingers = touches.length;

        FIRST_TOUCH = getFingerPosition(touches, fingers);
        GESTURE.el = getElementParentIfText(touches[0].target);
        GESTURE.fingers = fingers;
        GESTURE.last = now;

        if (fingers === 1) {
            GESTURE.isDoubleTap = delta > 0 && delta <= 250;
            return setTimeout(hold, HOLD_DELAY);
        } else if (fingers === 2) {
            GESTURE.initialAngle = parseInt(calcAngle(FIRST_TOUCH), 10);
            GESTURE.initialDistance = parseInt(calcDistance(FIRST_TOUCH), 10);
            GESTURE.angleDifference = 0;
            return GESTURE.distanceDifference = 0;
        }
    }

    /**
     * Touch Move
     *
     * @param {object} event
     * @return {*}
     */
    function move (event) {
        if (GESTURE.el) {
            var touches = getTouchesList(event),
                fingers = touches.length;

            if (fingers === GESTURE.fingers) {
                CURRENT_TOUCH = getFingerPosition(touches, fingers);
                if (gestureSwipe()) {
                    dispatch('swiping');
                }
                if (fingers === 2) {
                    gestureRotation();
                    gesturePinch();
                    event.preventDefault();
                }
            } else {
                clean();
            }
        }
        return true;
    }

    /**
     * Touch End
     *
     * @return {*}
     */
    function end () {
        var direction;
        if (GESTURE.fingers === 1) {
            if (gestureSwipe()) {
                dispatch('swipe');
                direction = getSwipeDirection(FIRST_TOUCH[0].x, CURRENT_TOUCH[0].x, FIRST_TOUCH[0].y, CURRENT_TOUCH[0].y);
                dispatch('swipe' + direction);
                return clean();
            } else {
                if (GESTURE.isDoubleTap) {
                    dispatch('doubleTap');
                    return clean();
                } else {
                    TOUCH_TIMEOUT = setTimeout(function () {
                        dispatch('singleTap');
                        clean();
                    }, 250);
                    return TOUCH_TIMEOUT;
                }
            }
        } else if (GESTURE.fingers === 2) {
            var anyEvent = false;

            if (GESTURE.angleDifference !== 0) {
                dispatch('rotate', {
                    angle: GESTURE.angleDifference
                });
                direction = 'rotate' + (GESTURE.angleDifference > 0 ? 'Right' : 'Left');
                dispatch(direction, {
                    angle: GESTURE.angleDifference
                });
                anyEvent = true;
            }

            if (GESTURE.distanceDifference !== 0) {
                dispatch('pinch', {
                    angle: GESTURE.distanceDifference
                });
                direction = 'pinch' + (GESTURE.distanceDifference > 0 ? 'Out' : 'In');
                dispatch(direction, {
                    distance: GESTURE.distanceDifference
                });
                anyEvent = true;
            }

            if (!anyEvent && CURRENT_TOUCH[0]) {
                if (Math.abs(FIRST_TOUCH[0].x - CURRENT_TOUCH[0].x) > 10 || Math.abs(FIRST_TOUCH[0].y - CURRENT_TOUCH[0].y) > 10) {
                    dispatch('drag');
                    direction = getSwipeDirection(FIRST_TOUCH[0].x, CURRENT_TOUCH[0].x, FIRST_TOUCH[0].y, CURRENT_TOUCH[0].y);
                    dispatch('drag' + direction);
                }
            }
            return clean();
        }
    }

    window.addEventListener('DOMContentLoaded', function () {
        var listen = {
            'touchstart'    : start,
            'touchmove'     : move,
            'touchend'      : end,
            'touchcancel'   : clean };

        for (var event in listen) {
            if (listen.hasOwnProperty(event)) {
                document.body.addEventListener(event, listen[event], false);
            }
        }
    }, false);
}(window));
