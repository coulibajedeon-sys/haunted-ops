# Requirements Document

## Introduction

The salt-circle-banish feature adds a gesture-based way to banish a task in the haunted-ops app. A user "banishes" a task by drawing a closed loop — a "salt circle" — around that task card's ghost icon using mouse, touch, or pen input. While the user drags, a glowing white salt trail is drawn as an SVG overlay. A pure geometry function decides whether the completed gesture qualifies as a circle. On success, the circle closes with a flash and the task is removed through the existing banish flow (the same request to `/banish/{id}` and the same evaporation animation plus particles). On failure, the salt trail fades out with a subtle fizzle.

The gesture is an additive enhancement. The existing Banish button, Enter key, and Space key remain fully functional accessible fallbacks. The server contract (`main.py`, the `/banish/{id}` endpoint) is unchanged, and all existing tests must continue to pass. The pure geometry logic lives in the require()-able core of a vanilla JS module so it can be property-tested under Node with fast-check, independently of any DOM or network.

## Glossary

- **Salt_Circle_Module**: The new vanilla JS module (two-layer: pure core + DOM adapter) that implements the salt-circle gesture and its geometry. Loaded via the UMD pattern so it is both `require()`-able under Node and available as a browser global.
- **Gesture_Core**: The pure, Node-safe layer of the Salt_Circle_Module. Contains no DOM access and no network access. Exports `isCircleGesture` and its geometry helpers for property testing.
- **DOM_Adapter**: The browser-only layer of the Salt_Circle_Module, guarded by `typeof document !== "undefined"`. Wires Pointer Events, renders the salt trail, and triggers the banish flow.
- **isCircleGesture**: A pure function `isCircleGesture(points, targetRect)` that returns a boolean indicating whether the recorded gesture qualifies as a circle enclosing the target.
- **Gesture_Points**: The ordered list of pointer sample positions (each with x and y coordinates) recorded during a single drag, passed to `isCircleGesture` as `points`.
- **Target_Rect**: The bounding rectangle of the ghost icon being circled, passed to `isCircleGesture` as `targetRect`. Its center is the point the loop must enclose.
- **Ghost_Icon**: The ghost icon element inside a task card (`<li data-id="...">`) that the user presses on to start the gesture.
- **Task_Card**: A `<li data-id="...">` element containing a Ghost_Icon and a `<form class="banish-form">` with a Banish submit button.
- **Salt_Trail**: The glowing white SVG path overlay drawn to follow the pointer while the user is dragging.
- **Banish_Flow**: The existing banish behavior implemented in `static/banish.js`, invoked via `banishItem(li, opts)`, which submits a POST to `/banish/{id}`, plays the 400 ms evaporation animation (`ANIMATION_MS`), spawns card particles, and removes the Task_Card on a 2xx response.
- **Banish_Button**: The existing `<button type="submit">` inside each `<form class="banish-form">` that banishes the task when clicked, or activated with Enter or Space while focused.
- **Reduced_Motion**: The user preference reported by the `(prefers-reduced-motion: reduce)` media query.
- **Salt_Hint**: A short on-screen hint reading "Draw a circle of salt, or press Banish" that fades out after the first successful salt-circle banish.
- **Swept_Angle**: The total cumulative angle, in degrees, that the Gesture_Points sweep around the Target_Rect center.

## Requirements

### Requirement 1: Preserve the server contract and existing behavior

**User Story:** As a maintainer of haunted-ops, I want the salt-circle feature to reuse the existing banish backend and leave current behavior intact, so that no server contract changes and nothing already working breaks.

#### Acceptance Criteria

1. THE Salt_Circle_Module SHALL make no additions, deletions, or modifications to the contents of `main.py`.
2. WHEN a salt-circle gesture succeeds, THE Salt_Circle_Module SHALL banish the Task_Card through the existing Banish_Flow by sending exactly one `POST /banish/{id}` request, where `{id}` is the Task_Card's `data-id`, identical in method, path, and payload to the request the Banish_Button sends.
3. THE Salt_Circle_Module SHALL invoke the existing `banishItem` function exported from `static/banish.js` to perform the banish, and SHALL NOT define any alternative banish request path.
4. IF the `POST /banish/{id}` request triggered by a successful salt-circle gesture returns a non-2xx response or fails due to a network error, THEN THE Salt_Circle_Module SHALL apply the same failure handling the Banish_Button path applies: restore the Task_Card to its original position in the list, display an error indication that banishment did not occur, and leave the server state unchanged, with no additional or divergent failure handling introduced by the Salt_Circle_Module.
5. THE Salt_Circle_Module SHALL make no additions, deletions, or modifications to any file under the `tests/` directory, so that every existing JS property test and Python test remains byte-for-byte unchanged.
6. WHEN the test suites are executed, THE Salt_Circle_Module SHALL preserve the behavior exercised by all existing tests such that `npm test` reports 0 failing tests and `pytest` reports 0 failing tests.
7. THE Salt_Circle_Module SHALL render all user-visible text in English.
8. THE Salt_Circle_Module SHALL be implemented using only plain HTML, CSS, inline SVG, and vanilla JavaScript, with no third-party frameworks and no build step.

### Requirement 2: Draw the salt trail during a pointer drag

**User Story:** As a user, I want to press on a task's ghost icon and drag a loop around it with any pointer device, so that I can perform the salt-circle gesture naturally.

#### Acceptance Criteria

1. WHEN a user presses on a Ghost_Icon and the pointer moves at least 5 CSS pixels from the press origin, THE DOM_Adapter SHALL begin recording Gesture_Points for that Task_Card.
2. THE DOM_Adapter SHALL record pointer input from mouse, touch, and pen devices using Pointer Events.
3. WHILE a gesture is being recorded, THE DOM_Adapter SHALL append a new Gesture_Point for each pointer move event, retaining up to 2000 Gesture_Points and discarding the oldest points beyond that limit.
4. WHILE a gesture is being recorded, THE DOM_Adapter SHALL render a glowing white Salt_Trail as an SVG path overlay that follows the recorded Gesture_Points and updates within 100 milliseconds of each recorded Gesture_Point.
5. WHILE a gesture is being recorded, THE DOM_Adapter SHALL associate the recorded Gesture_Points with the Target_Rect of the pressed Ghost_Icon.
6. WHEN the pointer is released, THE DOM_Adapter SHALL stop recording Gesture_Points and evaluate the completed gesture.
7. IF the pointer interaction is canceled before release (for example, the pointer leaves the recording surface or the browser issues a pointer cancel), THEN THE DOM_Adapter SHALL stop recording Gesture_Points, discard the recorded Gesture_Points for that Task_Card, and remove the Salt_Trail overlay without evaluating the gesture.

### Requirement 3: Classify the gesture with a pure function

**User Story:** As a developer, I want a pure `isCircleGesture(points, targetRect)` function in a Node-safe core, so that the circle-detection logic is deterministic, reusable, and property-testable without a browser.

#### Acceptance Criteria

1. THE Gesture_Core SHALL expose a pure function `isCircleGesture(points, targetRect)` that returns a boolean and performs no DOM access and no network access.
2. THE Salt_Circle_Module SHALL place `isCircleGesture` and its geometry helpers in the Gesture_Core so that they are `require()`-able under Node.
3. THE Gesture_Core SHALL guard all DOM access behind a `typeof document !== "undefined"` check so that requiring the module under Node produces no side effects.
4. WHEN the Swept_Angle of the Gesture_Points around the Target_Rect center is at least 300 degrees AND the straight-line distance between the gesture start point and end point is at most 20 percent of the total path length AND the loop encloses the Target_Rect center AND the number of Gesture_Points is at least 8, THE Gesture_Core SHALL return true to classify the gesture as a circle.
5. IF the Swept_Angle of the Gesture_Points around the Target_Rect center is below 300 degrees, THEN THE Gesture_Core SHALL return false to classify the gesture as not a circle.
6. IF the straight-line distance between the gesture start point and end point exceeds 20 percent of the total path length, THEN THE Gesture_Core SHALL return false to classify the gesture as not a circle.
7. IF the loop does not enclose the Target_Rect center, THEN THE Gesture_Core SHALL return false to classify the gesture as not a circle.
8. IF the number of Gesture_Points is below 8, THEN THE Gesture_Core SHALL return false to classify the gesture as not a circle.
9. IF the bounding extent of the Gesture_Points is less than 20 pixels in either width or height, THEN THE Gesture_Core SHALL return false to classify the gesture as not a circle.
10. IF `points` is null, undefined, or contains fewer than 8 entries, OR `targetRect` is null or undefined, THEN THE Gesture_Core SHALL return false without throwing and without DOM or network access.

### Requirement 4: Resolve a successful gesture into a banish

**User Story:** As a user, I want a completed salt circle to banish the encircled task with a satisfying flash, so that the gesture produces the same outcome as pressing Banish.

#### Acceptance Criteria

1. WHEN a completed gesture is classified as a circle that encloses exactly one Ghost_Icon, THE DOM_Adapter SHALL close the Salt_Trail with a flash effect lasting between 150 and 400 milliseconds.
2. WHEN the flash effect for a successful gesture completes, THE DOM_Adapter SHALL invoke the existing Banish_Flow on the Task_Card whose Ghost_Icon was enclosed by the circle.
3. WHEN the Banish_Flow runs after a successful gesture, THE DOM_Adapter SHALL present the same evaporation animation and card particles that the Banish_Button produces.
4. IF a completed gesture is classified as a circle but encloses no Ghost_Icon, THEN THE DOM_Adapter SHALL remove the Salt_Trail without invoking the Banish_Flow and SHALL leave all Task_Cards unchanged.
5. IF a completed gesture is classified as a circle that encloses more than one Ghost_Icon, THEN THE DOM_Adapter SHALL invoke the Banish_Flow on only the Task_Card whose Ghost_Icon center is nearest the geometric center of the circle and SHALL leave the other enclosed Task_Cards unchanged.

### Requirement 5: Resolve a failed gesture with a fizzle

**User Story:** As a user, I want a gesture that does not qualify as a circle to clear away gently, so that I understand it did not work and the task stays in place.

#### Acceptance Criteria

1. WHEN a completed gesture is classified as not a circle, THE DOM_Adapter SHALL fade out the Salt_Trail with a fizzle effect that reduces the Salt_Trail opacity from fully visible to fully transparent over a duration between 300 and 800 milliseconds.
2. WHEN a completed gesture is classified as not a circle, THE DOM_Adapter SHALL leave the corresponding Task_Card in the Spirit_List with its position, text content, and completion state unchanged.
3. WHEN the fizzle effect reaches full transparency, THE DOM_Adapter SHALL remove the Salt_Trail overlay element from the DOM.
4. IF a new gesture begins while a fizzle effect is in progress, THEN THE DOM_Adapter SHALL remove the in-progress Salt_Trail overlay from the DOM and begin a new Salt_Trail for the new gesture.

### Requirement 6: Confine touch handling to the ghost icon on mobile

**User Story:** As a mobile user, I want the rest of the page to keep scrolling normally, so that only the ghost icon captures my drag while the salt gesture is available.

#### Acceptance Criteria

1. WHERE the salt gesture is available, THE DOM_Adapter SHALL apply `touch-action: none` only to the Ghost_Icon and SHALL NOT apply `touch-action: none` to any other page element.
2. WHILE a touch drag originates on an element other than the Ghost_Icon, THE DOM_Adapter SHALL allow native page scrolling in the direction of the drag without consuming or canceling the touch event.
3. WHEN a touch drag originates on the Ghost_Icon, THE DOM_Adapter SHALL capture the touch for the salt gesture and SHALL prevent the page from scrolling for the duration of that touch.
4. IF the salt gesture is not available, THEN THE DOM_Adapter SHALL NOT apply `touch-action: none` to the Ghost_Icon, allowing native page scrolling over the Ghost_Icon.

### Requirement 7: Keep accessible fallbacks and show a dismissible hint

**User Story:** As a user who relies on the keyboard or the button, I want Banish to keep working and a short hint to explain the gesture, so that the feature is discoverable without being required.

#### Acceptance Criteria

1. WHEN a user activates the Banish_Button with a mouse click, THE Banish_Flow SHALL remove the targeted Task_Card from the visible task list within 500 milliseconds.
2. WHEN a user presses Enter while the Banish_Button is focused, THE Banish_Flow SHALL remove the targeted Task_Card from the visible task list within 500 milliseconds.
3. WHEN a user presses Space while the Banish_Button is focused, THE Banish_Flow SHALL remove the targeted Task_Card from the visible task list within 500 milliseconds.
4. THE DOM_Adapter SHALL display the Salt_Hint text "Draw a circle of salt, or press Banish".
5. IF a banish triggered by the Banish_Button, Enter, or Space fails due to a non-2xx response or network error, THEN THE Banish_Flow SHALL retain the targeted Task_Card unchanged and display an error indication that banishment did not occur.
6. WHEN the first salt-circle banish succeeds, THE DOM_Adapter SHALL fade out the Salt_Hint from full visibility to 0 percent opacity over a duration between 200 and 1000 milliseconds and remove it from the accessibility tree.
7. WHILE no salt-circle banish has yet succeeded, THE DOM_Adapter SHALL keep the Salt_Hint visible at full opacity.

### Requirement 8: Respect reduced-motion preference

**User Story:** As a user who prefers reduced motion, I want no animated trail effects, so that only the end result appears without motion that could cause discomfort.

#### Acceptance Criteria

1. WHILE Reduced_Motion is active, THE DOM_Adapter SHALL suppress the animated Salt_Trail, flash, and fizzle effects so that none of these effects are rendered at any point during the Banish_Flow.
2. WHILE Reduced_Motion is active AND a gesture is classified as a circle, THE DOM_Adapter SHALL render the end result of the Banish_Flow, where the end result is the final state in which the banished target is removed and the post-banish view is displayed, without rendering any intermediate Salt_Trail, flash, or fizzle frames.
3. IF Reduced_Motion becomes active while a Salt_Trail, flash, or fizzle animation is in progress, THEN THE DOM_Adapter SHALL immediately stop the in-progress animation and render the end result of the Banish_Flow directly.

### Requirement 9: Property-test the pure geometry under Node

**User Story:** As a developer, I want property tests for the circle geometry that run under Node, so that circle detection is verified across sizes and directions without a browser.

#### Acceptance Criteria

1. WHEN the Gesture_Core is required under Node, THE Gesture_Core SHALL load without throwing and without any DOM or network access, exposing `isCircleGesture` and its helpers for property testing with fast-check.
2. WHEN Gesture_Points describe a perfect circle enclosing the Target_Rect center at a radius between 20 and 400 pixels, with at least 8 Gesture_Points, THE Gesture_Core SHALL return true from `isCircleGesture`.
3. WHEN Gesture_Points describe a perfect circle in either clockwise or counter-clockwise rotation, with at least 8 Gesture_Points, THE Gesture_Core SHALL return true from `isCircleGesture`.
4. WHEN Gesture_Points describe a straight line, THE Gesture_Core SHALL return false from `isCircleGesture`.
5. WHEN Gesture_Points describe a partial arc with at least 8 Gesture_Points whose Swept_Angle is below 300 degrees, THE Gesture_Core SHALL return false from `isCircleGesture`.
6. WHEN `isCircleGesture` is evaluated twice on identical inputs, THE Gesture_Core SHALL return the same boolean result both times.
