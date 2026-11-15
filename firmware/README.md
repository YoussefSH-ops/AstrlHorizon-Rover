# Astral Horizon Rover

The hardware companion to Astral Horizon: a small Wi-Fi rover that can be driven by hand, helped by its sensors, or left to drive itself and steer around obstacles. It reports its surroundings and its own health in real time, and logs them for later.

It is the physical prototype of the **ARES Eyes** idea: a rover that travels beside an astronaut and feeds information to the planning software.

> **Prototype status.** This firmware drives the rover, avoids obstacles and records sensor data. It does **not** yet include a camera or visual odometry, and it does not send a position to the planning software. Those are planned next steps.

---

## What it does

- **Drives three ways** (see Modes below), from any phone or laptop, with no internet or router needed. The rover creates its own Wi-Fi network and serves its own control page.
- **Avoids obstacles** using an ultrasonic distance sensor and two infrared sensors.
- **Senses its environment:** temperature, humidity, air pressure and compass heading.
- **Watches its own health:** battery level, battery voltage and motor current.
- **Keeps a log** of the last 10 minutes of sensor readings, downloadable as a CSV file.
- **Protects itself** with soft starts, a connection-loss stop, a low-battery cutoff and a watchdog restart.

---

## Modes

| Mode | What happens |
|---|---|
| **Manual** | You drive with on-screen buttons or the keyboard (W A S D, arrow keys, space to stop). |
| **Assisted** | You drive, but the rover refuses to move forward into an obstacle. It still lets you reverse and turn. |
| **Auto** | The rover drives forward on its own. When something blocks the way it stops, reverses, turns in small steps until it finds a clear path, and carries on. If it is boxed in, it escapes rather than sitting still. |
| **Standby** | Motors are held off. |

### How Auto mode steers around obstacles

1. An obstacle closer than 20 cm, or a hit from either infrared sensor, stops the rover.
2. It sounds a short beep and reverses a little.
3. It turns in small steps, measuring the distance after each one, until the road ahead is clear (40 cm or more, twice in a row). If the obstacle was on one side, it turns the other way first; otherwise it alternates left and right.
4. If no fully clear direction exists, it turns back to the most open direction it saw, as long as there was at least 30 cm of room.
5. If that fails twice, it backs up and turns away to escape.

---

## Safety features

- **Soft start:** speed changes gradually, and the rover slows to a stop before reversing direction.
- **Connection loss:** in Manual and Assisted modes, the rover stops if it hears no command for 0.6 seconds.
- **Obstacle stop:** in Assisted mode, forward motion is blocked near obstacles.
- **Low battery:** the rover warns with a red light and beeps. Auto mode always stops and returns to Standby; Manual and Assisted can also be set to stop.
- **Watchdog:** if the code ever freezes for 8 seconds, the board restarts itself.
- **Status lights and buzzer:** green steady means connected and green blinking means waiting for a connection. Red means low battery, avoiding an obstacle, or blocked. The buzzer signals mode changes, obstacles, the horn and low battery.

---

## The control page

Connect to the rover's Wi-Fi network and open its address in a browser. The page shows:

- Mode buttons, direction pad, speed slider and a horn button
- A live status line (for example "AUTO - SEARCH LEFT" or "LOW BATTERY")
- Battery percentage and voltage, motor current, distance ahead, infrared sensors, temperature, humidity, pressure and compass heading
- A link to download the sensor log

The page is stored inside the rover, so it works with no internet.

---

## Hardware

| Part | Purpose |
|---|---|
| RP2040 board with Wi-Fi (Raspberry Pi Pico W) | The rover's brain, Wi-Fi hotspot and web server |
| Dual motor driver and two DC motors | Driving and turning |
| Ultrasonic distance sensor | Distance ahead |
| Two infrared obstacle sensors | Left and right obstacle detection |
| BMP280 | Air pressure and accurate temperature |
| DHT11 | Humidity (and temperature if the BMP280 is missing) |
| Compass module (QMC5883L or HMC5883L, detected automatically) | Heading |
| ACS712 current sensor | Motor current |
| Voltage sensor module | Battery voltage (2-cell battery pack) |
| Buzzer and two LEDs (green, red) | Sound and light feedback |

Optional parts can be switched off in the settings at the top of the code (current sensor, battery sensor), so the firmware still runs without them.

### Pin map

| Function | Pin |
|---|---|
| Left motor (enable, in1, in2) | 2, 3, 4 |
| Right motor (enable, in3, in4) | 5, 6, 7 |
| I2C data and clock (BMP280, compass) | 8, 9 |
| DHT11 | 10 |
| Ultrasonic trigger and echo | 11, 12 (echo through a 1k/2k voltage divider) |
| Infrared left and right | 13, 14 |
| Buzzer | 17 |
| Green and red LED | 18, 19 |
| Current sensor and battery sensor (analog) | 26, 27 |

---

## Settings you can tune

All settings are grouped at the top of the code, with comments:

- Wi-Fi network name and password
- Which optional sensors are installed
- Battery warning levels
- Driving speeds and soft-start rate
- Obstacle distances (stop, clear and accept)
- Reverse time and the size of each search turn
- Log interval (default every 5 seconds, 120 samples)

Change the default Wi-Fi password before sharing or publishing the code.

---

## Libraries used

Adafruit BMP280, DHT sensor library, and the standard WiFi, WebServer and Wire libraries for the RP2040 board.

---

## Current limits

- No camera, visual odometry or position tracking yet.
- Compass heading is a raw reading and is not calibrated or corrected for tilt.
- The two infrared sensors are assumed to be left and right.
- The rover only knows what its sensors tell it. It does not follow routes from the planning software.
- The control page works only while connected to the rover's own Wi-Fi.