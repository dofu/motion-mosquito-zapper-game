# Motion Mosquito Zapper

A motion-controlled browser game where your hand is an electric racquet. Mosquitoes fly around your room on camera, and you swat them by moving your hand. Chain kills for combos, and chase the golden ones for 5x.

**Play:** https://dofu.github.io/motion-mosquito-zapper-game/

## Modes

| Mode | Rules |
|---|---|
| **Levels** | Zap 10 mosquitoes to clear a level. The racquet shrinks 15% every level, the bugs get faster, and from level 3 they start to dodge. |
| **30 seconds** | A card-sized racquet and slow bugs. Score as much as you can before the clock runs out. |

Your best score, kills and chain for each mode are saved in your browser.

## How to play

1. Pick a mode, press **Let's zap** and allow the camera.
2. Pinch your thumb and index finger like you are holding a pen. The racquet extends from the pinch and follows your hand. One or both hands work.
3. Touch a mosquito with the racquet head to zap it. Kills within a second of each other build a combo, with a callout from 3 up and a bigger one from 8.
4. Golden mosquitoes are faster and worth 5x. Smaller mosquitoes pay a bonus because they are harder to spot.

Press **Esc** or **P**, or tap the pause button at the bottom right, to pause. The pause menu lets you resume, restart the round or go back to the menu. Switching to another tab pauses too, so a timer never runs out unseen.

Turn the sound on. Press **D** during play to show a calibration overlay of the pinch and the racquet axis.

## How it works

- Five files and no build step: `index.html` (the markup), `styles.css`, and three ordinary scripts, loaded in this order.
  - `audio.js`: every sound effect, generated with the Web Audio API.
  - `game.js`: difficulty, scoring, drawing, hand tracking and the main loop.
  - `screens.js`: mode select, pause, level up, time up and the start button.
- The scripts are plain scripts, not modules, so `index.html` also opens by double-click. The tracking library is loaded when you press start.
- Hand tracking uses [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) in the browser. The video stays on your device and nothing is uploaded.
- The tracking library comes from jsDelivr, the hand model from Google's model storage and the fonts from Google Fonts, so the game needs a network connection to start.
- Sound is generated with the Web Audio API. There are no audio files.
- Bests are kept in `localStorage`. If storage is blocked, they last for the session only.

## Run it locally

The camera only works on `https` or `localhost`, so serve the folder instead of opening the file:

```
npx serve .
```

Then open the address it prints.

## Checked so far

- Served on `localhost`, the page starts and runs without errors in both modes.
- With the hand tracker replaced by a scripted hand sweeping the screen, mosquitoes are zapped, the score and combo count, level 2 unlocks, the 30 second round ends on the results screen and the bests are saved.
- The pause menu opens with Esc, P and the button, freezes the score and the clock, and resume, restart and menu all work, on a wide and a phone-sized screen.
- Not yet tested: tracking a real hand, other browsers than Chromium, and phones.

## Known limits

- Needs a webcam and a browser with WebGL. The hand tracker is set to use the GPU, and there is no fallback if it is unavailable.
- The page blocks pinch zoom, which suits the game but is not friendly to everyone.
