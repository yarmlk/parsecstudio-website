/** Every service scene takes the same props. The stage mounts a scene the first time it is needed and keeps it;
 *  a scene that is not `on` must stop its animation loop (it is faded out by the stage). */
export interface SceneProps {
  /** this scene is the one on show */
  on: boolean;
  /** "desk" = 1440 × ~802 section; "mob" = 390-wide phone section */
  mode: "desk" | "mob";
}
