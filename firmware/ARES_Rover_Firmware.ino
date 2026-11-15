
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>

// ================= SETTINGS =================
const char* AP_SSID = "ARES-Rover";
const char* AP_PASS = "ares12345";           // at least 8 characters

#define DHTTYPE DHT11

const bool  USE_ACS712         = true;       // set false if the ACS712 is not installed
const bool  USE_BATTERY_SENSOR = true;       // set false if the voltage sensor is not installed
const float VBAT_FACTOR        = 5.0;        // voltage sensor module divides by 5. Calibrate with a multimeter
const float ACS_SENS           = 0.100;      // V per amp: 0.185 (5A), 0.100 (20A), 0.066 (30A)
const bool  IR_ACTIVE_LOW      = true;       // most IR modules output LOW when they see something

// battery (2 cells in series)
const bool  LOW_BATT_CUTOFF     = false;     // true = motors also stop in MANUAL/ASSISTED on low battery.
                                             // (AUTO mode always stops on low battery)
const float LOW_BATT_VOLTS      = 6.4;       // limit at rest
const float LOW_BATT_LOAD_VOLTS = 6.0;       // limit while the motors run (voltage sags under load)
const float LOW_BATT_RECOVER    = 6.8;       // battery is OK again above this

// driving
const int  RAMP_STEP            = 12;        // soft start: speed change per 20 ms
const unsigned long CMD_TIMEOUT_MS = 600;    // no command for this long = stop (manual modes)

// obstacle avoidance (ASSISTED and AUTO)
const int AUTO_SPEED          = 100;         // 0..100
const int TURN_SPEED          = 100;
const int STOP_DISTANCE_CM    = 20;          // closer than this = obstacle
const int CLEAR_DISTANCE_CM   = 40;          // preferred: front farther than this
const int ACCEPT_DISTANCE_CM  = 30;          // fallback: best direction accepted if at least this open
const int BACKUP_MS           = 400;         // reverse time before searching (0 = no reverse)
const int TURN_STEP_MS        = 250;         // one search step. Calibrate: MAX_STEPS steps = about 360 degrees
const int SETTLE_MS           = 120;         // wait after each step before measuring
const int MAX_STEPS           = 16;          // steps in one full circle
const int CLEAR_STEPS_NEEDED  = 2;           // clear readings in a row needed to accept a direction
const int MAX_ATTEMPTS        = 2;           // searches (alternating left / right) before escaping

// data logging
const unsigned long LOG_MS    = 5000;        // one sample every 5 s (120 samples = 10 minutes)

// ================= PINS =================
const int L_EN  = 2;   // ENA
const int L_IN1 = 3;   // IN1
const int L_IN2 = 4;   // IN2
const int R_EN  = 5;   // ENB
const int R_IN3 = 6;   // IN3
const int R_IN4 = 7;   // IN4

const int PIN_SDA   = 8;    // BMP280 + compass
const int PIN_SCL   = 9;
const int PIN_DHT   = 10;
const int PIN_TRIG  = 11;
const int PIN_ECHO  = 12;   // through the 1k/2k divider
const int PIN_IR1   = 13;   // left IR (assumed)
const int PIN_IR2   = 14;   // right IR (assumed)
const int PIN_BUZZ  = 17;
const int PIN_LED_G = 18;
const int PIN_LED_R = 19;
const int PIN_ACS   = 26;   // ADC0
const int PIN_VBAT  = 27;   // ADC1

// ================= MODES =================
#define MODE_MANUAL   0
#define MODE_ASSISTED 1
#define MODE_AUTO     2
#define MODE_STANDBY  3
const char* MODE_NAMES[] = {"MANUAL", "ASSISTED", "AUTO", "STANDBY"};

// ================= GLOBALS =================
WebServer server(80);
Adafruit_BMP280 bmp;
DHT dht(PIN_DHT, DHTTYPE);

int mode = MODE_MANUAL;
const char* stateName = "IDLE";

bool bmpOk = false;
uint8_t magType = 0;                 // 0 none, 1 QMC5883L, 2 HMC5883L
float temp = NAN, hum = NAN, pres = NAN, heading = NAN;
float battV = 0, current = 0, acsZero = 2.5;
int battPct = 0;
bool lowBatt = false;
int lowCount = 0, recoverCount = 0;

int frontDist = 999;
bool irL = false, irR = false;

int tgtL = 0, tgtR = 0;              // wanted speeds (-100..100)
int curL = 0, curR = 0;              // speeds actually applied
bool motorsOn = false;

bool avoiding = false;
int lastDir = 1;                     // +1 = last search turned left, -1 = right
unsigned long lastCmd = 0, lastHttp = 0, hornUntil = 0, beepUntil = 0;

const float PV[] = {6.4, 6.6, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4};
const int   PP[] = {0,   2,   8,   15,  30,  47,  62,  78,  90,  100};

// data log (ring buffer)
struct Sample {
  uint32_t t;
  uint8_t mode;
  float bv;
  uint8_t bp;
  float cur;
  int16_t dist;
  float temp, hum, pres, hd;
};
const int LOG_N = 120;
Sample logbuf[LOG_N];
int logCount = 0, logHead = 0;

// ================= MOTORS (soft start) =================
void setSide(int en, int inA, int inB, int speed) {
  speed = constrain(speed, -100, 100);
  digitalWrite(inA, speed > 0 ? HIGH : LOW);
  digitalWrite(inB, speed < 0 ? HIGH : LOW);
  analogWrite(en, abs(speed) * 255 / 100);
}

void stopMotors() {                  // immediate stop
  tgtL = 0; tgtR = 0;
  curL = 0; curR = 0;
  setSide(L_EN, L_IN1, L_IN2, 0);
  setSide(R_EN, R_IN3, R_IN4, 0);
  motorsOn = false;
}

void setTarget(int l, int r) {
  tgtL = constrain(l, -100, 100);
  tgtR = constrain(r, -100, 100);
}

int rampOne(int cur, int tgt) {
  if ((cur > 0 && tgt < 0) || (cur < 0 && tgt > 0)) tgt = 0;   // slow to zero before reversing
  if (cur < tgt) cur = min(cur + RAMP_STEP, tgt);
  else if (cur > tgt) cur = max(cur - RAMP_STEP, tgt);
  return cur;
}

// Runs every 20 ms. All the safety rules for every mode live here.
void applyMotors() {
  static unsigned long t = 0;
  if (millis() - t < 20) return;
  t = millis();

  int wl = tgtL, wr = tgtR;

  if (mode == MODE_STANDBY) { wl = 0; wr = 0; }

  if (mode == MODE_MANUAL || mode == MODE_ASSISTED) {
    if (millis() - lastCmd > CMD_TIMEOUT_MS) { wl = 0; wr = 0; }      // connection lost: stop
  }

  if (mode == MODE_ASSISTED && wl > 0 && wr > 0 &&
      (frontDist < STOP_DISTANCE_CM || irL || irR)) { wl = 0; wr = 0; }   // block forward only

  if (lowBatt && (LOW_BATT_CUTOFF || mode == MODE_AUTO)) { wl = 0; wr = 0; }

  curL = rampOne(curL, wl);
  curR = rampOne(curR, wr);
  setSide(L_EN, L_IN1, L_IN2, curL);
  setSide(R_EN, R_IN3, R_IN4, curR);
  motorsOn = (curL != 0 || curR != 0);
}

// ================= SENSORS =================
int readDistance() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long d = pulseIn(PIN_ECHO, HIGH, 25000);
  if (d == 0) return 999;                    // no echo = nothing in range
  return (int)(d * 0.0343 / 2);
}

void updateIR() {
  int active = IR_ACTIVE_LOW ? LOW : HIGH;
  irL = (digitalRead(PIN_IR1) == active);
  irR = (digitalRead(PIN_IR2) == active);
}

void writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(val); Wire.endTransmission();
}

void initMag() {
  Wire.beginTransmission(0x0D);
  if (Wire.endTransmission() == 0) {         // QMC5883L
    magType = 1;
    writeReg(0x0D, 0x0B, 0x01);
    writeReg(0x0D, 0x09, 0x1D);
    return;
  }
  Wire.beginTransmission(0x1E);
  if (Wire.endTransmission() == 0) {         // HMC5883L
    magType = 2;
    writeReg(0x1E, 0x00, 0x70);
    writeReg(0x1E, 0x01, 0x20);
    writeReg(0x1E, 0x02, 0x00);
  }
}

void readMag() {
  int16_t x = 0, y = 0;
  uint8_t b[6];
  if (magType == 1) {
    Wire.beginTransmission(0x0D); Wire.write(0x00); Wire.endTransmission(false);
    if (Wire.requestFrom((uint8_t)0x0D, (size_t)6) != 6) return;
    for (int i = 0; i < 6; i++) b[i] = Wire.read();
    x = (int16_t)((b[1] << 8) | b[0]);
    y = (int16_t)((b[3] << 8) | b[2]);
  } else if (magType == 2) {
    Wire.beginTransmission(0x1E); Wire.write(0x03); Wire.endTransmission(false);
    if (Wire.requestFrom((uint8_t)0x1E, (size_t)6) != 6) return;
    for (int i = 0; i < 6; i++) b[i] = Wire.read();
    x = (int16_t)((b[0] << 8) | b[1]);
    y = (int16_t)((b[4] << 8) | b[5]);       // HMC order is X, Z, Y
  } else return;

  float h = atan2((float)y, (float)x) * 180.0 / PI;
  if (h < 0) h += 360;
  heading = h;
}

float readBattV() {
  long sum = 0;
  for (int i = 0; i < 32; i++) sum += analogRead(PIN_VBAT);
  return (sum / 32.0) / 4095.0 * 3.3 * VBAT_FACTOR;
}

int voltsToPct(float v) {
  if (v <= PV[0]) return 0;
  if (v >= PV[9]) return 100;
  for (int i = 0; i < 9; i++) {
    if (v >= PV[i] && v <= PV[i + 1])
      return PP[i] + (PP[i + 1] - PP[i]) * (v - PV[i]) / (PV[i + 1] - PV[i]);
  }
  return 0;
}

float acsVolts(int n) {
  long sum = 0;
  for (int i = 0; i < n; i++) sum += analogRead(PIN_ACS);
  return (sum / (float)n) / 4095.0 * 3.3 * 1.5;   // undo the 10k/20k divider
}

void calibrateACS() {
  if (USE_ACS712) acsZero = acsVolts(200);        // motors must be off
}

float readCurrent() {
  if (!USE_ACS712) return 0;
  float a = (acsVolts(50) - acsZero) / ACS_SENS;
  if (fabs(a) < 0.15) a = 0;
  return a;
}

// ================= DATA LOG =================
void addLog() {
  Sample &s = logbuf[logHead];
  s.t    = millis() / 1000;
  s.mode = mode;
  s.bv   = battV;
  s.bp   = battPct;
  s.cur  = current;
  s.dist = (frontDist >= 999) ? -1 : frontDist;
  s.temp = temp;
  s.hum  = hum;
  s.pres = pres;
  s.hd   = heading;
  logHead = (logHead + 1) % LOG_N;
  if (logCount < LOG_N) logCount++;
}

String csvNum(float v, int d) { return isnan(v) ? String("") : String(v, d); }

// ================= WEB PAGE =================
const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
body{font-family:sans-serif;text-align:center;background:#111;color:#eee;margin:0;padding:8px;
user-select:none;-webkit-user-select:none;touch-action:manipulation}
button{width:78px;height:78px;margin:4px;font-size:28px;border-radius:14px;border:0;background:#c1440e;color:#fff;touch-action:none}
button.x{background:#555}
button.h{width:auto;height:48px;font-size:18px;padding:0 20px;background:#2a6fb0}
button.m{width:auto;height:44px;font-size:14px;padding:0 12px;margin:3px;background:#333;border:2px solid #555}
button.m.on{background:#2e8b57;border-color:#9f9}
#s{width:80%}
table{margin:10px auto;border-collapse:collapse}
td{padding:4px 12px;border-bottom:1px solid #333;text-align:left}
#st{font-weight:bold;margin:6px}
a{color:#7cf}
</style></head><body>
<h2>ARES Rover</h2>
<div>
<button class="m" id="M0" onclick="mode(0)">MANUAL</button>
<button class="m" id="M1" onclick="mode(1)">ASSISTED</button>
<button class="m" id="M2" onclick="mode(2)">AUTO</button>
<button class="m" id="M3" onclick="mode(3)">STANDBY</button>
</div>
<div id="st">...</div>
<div><button id="FL">&#8598;</button><button id="F">&#9650;</button><button id="FR">&#8599;</button></div>
<div><button id="L">&#9664;</button><button id="X" class="x">&#9632;</button><button id="R">&#9654;</button></div>
<div><button id="BL">&#8601;</button><button id="B">&#9660;</button><button id="BR">&#8600;</button></div>
<div><button class="h" onclick="fetch('/horn?ms=300')">&#128266; Horn</button></div>
<p>Speed: <span id="v">80</span>%</p>
<input id="s" type="range" min="40" max="100" value="80">
<table>
<tr><td>Battery</td><td><span id="bp">--</span>% (<span id="bv">--</span> V)</td></tr>
<tr><td>Motor current</td><td><span id="cur">--</span> A</td></tr>
<tr><td>Distance ahead</td><td><span id="dist">--</span> cm</td></tr>
<tr><td>IR sensors</td><td>L: <span id="irl">--</span> &nbsp; R: <span id="irr">--</span></td></tr>
<tr><td>Temperature</td><td><span id="t">--</span> &deg;C</td></tr>
<tr><td>Humidity</td><td><span id="h">--</span> %</td></tr>
<tr><td>Pressure</td><td><span id="p">--</span> hPa</td></tr>
<tr><td>Heading</td><td><span id="hd">--</span> &deg;</td></tr>
</table>
<p><a href="/log">Download sensor log (CSV)</a></p>
<p style="color:#888;font-size:13px">Driving buttons work in MANUAL and ASSISTED.<br>Keyboard: W A S D or arrow keys, space = stop</p>
<script>
var sp=80, t=null, active=null;
var MAP={F:[1,1],B:[-1,-1],L:[-1,1],R:[1,-1],X:[0,0],FL:[0.4,1],FR:[1,0.4],BL:[-0.4,-1],BR:[-1,-0.4]};
document.getElementById('s').oninput=function(){sp=+this.value;document.getElementById('v').innerText=sp;};
function send(l,r){fetch('/m?l='+Math.round(l)+'&r='+Math.round(r)).catch(function(){});}
function stop(){
  if(t){clearInterval(t);t=null;}
  if(active!==null){active=null;send(0,0);}
}
function go(id){
  if(active===id)return;
  stop();
  active=id;
  var m=MAP[id];
  function tick(){send(m[0]*sp,m[1]*sp);}
  tick(); t=setInterval(tick,200);
}
Object.keys(MAP).forEach(function(id){
  var b=document.getElementById(id);
  b.addEventListener('pointerdown',function(e){e.preventDefault();go(id);});
  ['pointerup','pointerleave','pointercancel'].forEach(function(ev){b.addEventListener(ev,stop);});
});
var KEYS={ArrowUp:'F',w:'F',ArrowDown:'B',s:'B',ArrowLeft:'L',a:'L',ArrowRight:'R',d:'R',' ':'X'};
document.addEventListener('keydown',function(e){var id=KEYS[e.key];if(id){e.preventDefault();go(id);}});
document.addEventListener('keyup',function(e){if(KEYS[e.key])stop();});
window.addEventListener('blur',stop);
function mode(n){fetch('/mode?m='+n).then(function(){poll();}).catch(function(){});}
function set(id,v){document.getElementById(id).innerText=(v===null||v===undefined)?'--':v;}
function poll(){
  fetch('/s').then(function(r){return r.json();}).then(function(d){
    set('bp',d.bp);set('bv',d.bv);set('cur',d.cur);set('dist',d.dist>=999?'clear':d.dist);
    set('irl',d.irl?'HIT':'clear');set('irr',d.irr?'HIT':'clear');
    set('t',d.t);set('h',d.h);set('p',d.p);set('hd',d.hd);set('st',d.st);
    for(var i=0;i<4;i++){document.getElementById('M'+i).className='m'+(d.mode===i?' on':'');}
  }).catch(function(){set('st','NO CONNECTION');});
}
setInterval(poll,1000);poll();
</script></body></html>
)rawliteral";

String num(float v, int d) { return isnan(v) ? String("null") : String(v, d); }

void beep(unsigned long ms) { beepUntil = millis() + ms; }

void setMode(int m) {
  if (m < 0 || m > 3) return;
  mode = m;
  stopMotors();
  lastCmd = 0;                               // manual modes need a fresh command
  stateName = "IDLE";
  beep(m == MODE_AUTO ? 300 : 100);
  Serial.print(">>> MODE: "); Serial.println(MODE_NAMES[mode]);
}

void handleRoot() { lastHttp = millis(); server.send_P(200, "text/html", PAGE); }

void handleMove() {
  lastHttp = millis();
  if (mode == MODE_MANUAL || mode == MODE_ASSISTED) {
    setTarget(server.arg("l").toInt(), server.arg("r").toInt());
    lastCmd = millis();
  }
  server.send(200, "text/plain", "ok");
}

void handleMode() {
  lastHttp = millis();
  setMode(server.arg("m").toInt());
  server.send(200, "text/plain", "ok");
}

void handleStatus() {
  lastHttp = millis();
  String st = String(MODE_NAMES[mode]);
  if (mode == MODE_AUTO) st += " - " + String(stateName);
  if (mode == MODE_ASSISTED && (frontDist < STOP_DISTANCE_CM || irL || irR)) st += " - obstacle ahead";
  if (lowBatt) st += " - LOW BATTERY";

  String j = "{";
  j += "\"mode\":" + String(mode) + ",";
  j += "\"bv\":" + num(battV, 2) + ",";
  j += "\"bp\":" + String(battPct) + ",";
  j += "\"cur\":" + num(current, 2) + ",";
  j += "\"dist\":" + String(frontDist) + ",";
  j += "\"irl\":" + String(irL ? 1 : 0) + ",";
  j += "\"irr\":" + String(irR ? 1 : 0) + ",";
  j += "\"t\":" + num(temp, 1) + ",";
  j += "\"h\":" + num(hum, 0) + ",";
  j += "\"p\":" + num(pres, 0) + ",";
  j += "\"hd\":" + num(heading, 0) + ",";
  j += "\"st\":\"" + st + "\"}";
  server.send(200, "application/json", j);
}

void handleLog() {
  lastHttp = millis();
  String c;
  c.reserve(logCount * 64 + 120);
  c += "time_s,mode,battery_v,battery_pct,current_a,front_cm,temp_c,humidity_pct,pressure_hpa,heading_deg\n";
  int start = (logCount < LOG_N) ? 0 : logHead;
  for (int i = 0; i < logCount; i++) {
    Sample &s = logbuf[(start + i) % LOG_N];
    c += String(s.t) + "," + MODE_NAMES[s.mode] + "," + csvNum(s.bv, 2) + "," + String(s.bp) + ","
       + csvNum(s.cur, 2) + "," + (s.dist < 0 ? String("") : String(s.dist)) + ","
       + csvNum(s.temp, 1) + "," + csvNum(s.hum, 0) + "," + csvNum(s.pres, 0) + ","
       + csvNum(s.hd, 0) + "\n";
  }
  server.sendHeader("Content-Disposition", "attachment; filename=ares_rover_log.csv");
  server.send(200, "text/csv", c);
}

void handleHorn() {
  lastHttp = millis();
  int ms = constrain(server.arg("ms").toInt(), 0, 2000);
  hornUntil = millis() + ms;
  server.send(200, "text/plain", "ok");
}

void handlePing() { lastHttp = millis(); server.send(200, "text/plain", "ares"); }

// ================= SERIAL PRINT =================
void printVal(float v, int digits, const char* unit) {
  if (isnan(v)) Serial.print("--");
  else { Serial.print(v, digits); Serial.print(unit); }
}

void printSensors() {
  Serial.print("["); Serial.print(millis() / 1000.0, 1); Serial.print("s] ");
  Serial.print(MODE_NAMES[mode]);
  if (mode == MODE_AUTO) { Serial.print("/"); Serial.print(stateName); }

  Serial.print(" | Front:");
  if (frontDist >= 999) Serial.print("clear"); else { Serial.print(frontDist); Serial.print("cm"); }

  Serial.print(" | IR L:"); Serial.print(irL ? "HIT" : "-");
  Serial.print(" R:");      Serial.print(irR ? "HIT" : "-");

  Serial.print(" | Batt:");
  if (USE_BATTERY_SENSOR) { Serial.print(battV, 2); Serial.print("V "); Serial.print(battPct); Serial.print("%"); }
  else Serial.print("off");

  Serial.print(" | Cur:");
  if (USE_ACS712) { Serial.print(current, 2); Serial.print("A"); } else Serial.print("off");

  Serial.print(" | Temp:"); printVal(temp, 1, "C");
  Serial.print(" Hum:");    printVal(hum, 0, "%");
  Serial.print(" Press:");  printVal(pres, 0, "hPa");
  Serial.print(" | Hdg:");  printVal(heading, 0, "deg");
  Serial.println();
}

// ================= BACKGROUND TASKS =================
// Runs all the time, also while the rover waits during avoidance, so the web page,
// the sensors, the soft start and the safety rules never freeze.
void housekeeping() {
  static unsigned long tDist = 0, tSlow = 0, tDht = 0, tPrint = 0, tLog = 0;

  rp2040.wdt_reset();                        // feed the watchdog
  server.handleClient();
  updateIR();
  applyMotors();

  if (millis() - tDist >= 80) {              // front distance
    tDist = millis();
    int d = readDistance();
    if (d < STOP_DISTANCE_CM) { delay(10); d = readDistance(); }   // confirm close readings
    frontDist = d;
  }

  if (millis() - tSlow > 500) {              // battery, current, compass, pressure
    tSlow = millis();

    if (USE_BATTERY_SENSOR) {
      float v = readBattV();
      battV = battV * 0.8 + v * 0.2;         // smooth the reading
      battPct = voltsToPct(battV);

      float limit = motorsOn ? LOW_BATT_LOAD_VOLTS : LOW_BATT_VOLTS;   // voltage sags when motors run
      if (!lowBatt) {
        if (battV > 3.0 && battV < limit) lowCount++; else lowCount = 0;
        if (lowCount >= 10) {                // low for 5 seconds in a row
          lowBatt = true;
          recoverCount = 0;
          Serial.print(">>> LOW BATTERY ("); Serial.print(battV, 2); Serial.println(" V)");
        }
      } else {
        if (battV > LOW_BATT_RECOVER) recoverCount++; else recoverCount = 0;
        if (recoverCount >= 6) { lowBatt = false; lowCount = 0; Serial.println(">>> Battery recovered"); }
      }
    }
    current = readCurrent();
    readMag();
    if (bmpOk) pres = bmp.readPressure() / 100.0;   // hPa
  }

  if (millis() - tDht > 3000) {              // DHT11 is slow
    tDht = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (bmpOk) temp = bmp.readTemperature(); // BMP280 is more accurate
    else if (!isnan(t)) temp = t;
    if (!isnan(h)) hum = h;
  }

  if (millis() - tLog >= LOG_MS) { tLog = millis(); addLog(); }
  if (millis() - tPrint >= 1000) { tPrint = millis(); printSensors(); }

  // LEDs and buzzer
  bool linked = (millis() - lastHttp) < 3000;
  bool blocked = (mode == MODE_ASSISTED) && (frontDist < STOP_DISTANCE_CM || irL || irR);
  digitalWrite(PIN_LED_G, linked ? HIGH : ((millis() / 500) % 2));   // solid = connected, blink = waiting
  digitalWrite(PIN_LED_R, (lowBatt || avoiding || blocked) ? HIGH : LOW);

  if ((long)(hornUntil - millis()) > 0)      digitalWrite(PIN_BUZZ, HIGH);
  else if ((long)(beepUntil - millis()) > 0) digitalWrite(PIN_BUZZ, HIGH);
  else if (lowBatt)                          digitalWrite(PIN_BUZZ, ((millis() / 250) % 16) == 0);  // short warning beep
  else                                       digitalWrite(PIN_BUZZ, LOW);
}

bool aborted() { return mode != MODE_AUTO || lowBatt; }

// Delay that keeps everything running. Leaves early if AUTO is cancelled.
void waitMs(unsigned long ms) {
  unsigned long t = millis();
  while (millis() - t < ms) {
    housekeeping();
    if (avoiding && aborted()) break;
  }
}

// ================= AUTO MODE: OBSTACLE AVOIDANCE =================
int readDistanceAvg() {                      // average of 2 readings, "clear" counts as 300 cm
  long sum = 0;
  for (int i = 0; i < 2; i++) {
    sum += min(readDistance(), 300);
    waitMs(40);
  }
  return sum / 2;
}

// dir = +1 turns left, dir = -1 turns right
void turnStep(int dir) {
  setTarget(-dir * TURN_SPEED, dir * TURN_SPEED);
  waitMs(TURN_STEP_MS);
  stopMotors();
}

// Turns the whole rover in small steps until the road ahead is clear.
// If no fully clear road exists, it turns back to the most open direction it saw.
bool searchClear(int dir) {
  int okCount = 0;
  int best = 0, bestIdx = 0;

  for (int s = 1; s <= MAX_STEPS; s++) {
    if (aborted()) return false;
    stateName = (dir > 0) ? "SEARCH LEFT" : "SEARCH RIGHT";
    turnStep(dir);
    waitMs(SETTLE_MS);                       // let the rover stop moving before measuring
    if (aborted()) return false;

    int d = readDistanceAvg();
    if (d > best) { best = d; bestIdx = s; }

    bool clear = (d >= CLEAR_DISTANCE_CM);
    Serial.print(">>> step "); Serial.print(s);
    Serial.print(": front "); Serial.print(d >= 300 ? 999 : d); Serial.print(" cm");
    Serial.println(clear ? "  -> clear" : "  -> blocked");

    okCount = clear ? okCount + 1 : 0;
    if (okCount >= CLEAR_STEPS_NEEDED) return true;
  }

  if (best >= ACCEPT_DISTANCE_CM && !aborted()) {
    int back = MAX_STEPS - bestIdx;
    Serial.print(">>> No fully clear road. Best was step "); Serial.print(bestIdx);
    Serial.print(" ("); Serial.print(best); Serial.print(" cm), turning back "); Serial.print(back);
    Serial.println(" steps");
    stateName = "TO BEST";
    for (int i = 0; i < back && !aborted(); i++) {
      turnStep(-dir);
      waitMs(60);
    }
    return !aborted();
  }
  return false;
}

void avoid() {
  avoiding = true;
  stopMotors();
  stateName = "OBSTACLE";
  Serial.print(">>> OBSTACLE detected, front "); Serial.print(frontDist);
  Serial.print(" cm, IR L:"); Serial.print(irL ? "HIT" : "-");
  Serial.print(" R:");        Serial.println(irR ? "HIT" : "-");
  beep(150);
  waitMs(300);

  // choose the first turning direction
  int dir;
  if (irL && !irR)      dir = -1;            // obstacle on the left: turn right
  else if (irR && !irL) dir = 1;             // obstacle on the right: turn left
  else                  dir = -lastDir;      // otherwise alternate

  bool found = false;
  for (int attempt = 1; attempt <= MAX_ATTEMPTS && !found && !aborted(); attempt++) {
    Serial.print(">>> Search "); Serial.print(attempt);
    Serial.println(dir > 0 ? " (turning left)" : " (turning right)");

    if (BACKUP_MS > 0) {
      stateName = "REVERSE";
      setTarget(-AUTO_SPEED, -AUTO_SPEED);
      waitMs(BACKUP_MS);
      stopMotors();
      waitMs(250);
    }

    found = searchClear(dir);
    lastDir = dir;
    if (!found) dir = -dir;                  // failed: try the other way
  }

  if (found && !aborted()) {
    int extra = 0;                           // if an IR sensor still sees something, turn a bit more
    while ((irL || irR) && extra < 6 && !aborted()) {
      Serial.println(">>> IR still sees an obstacle, turning a bit more");
      turnStep(lastDir);
      waitMs(SETTLE_MS);
      extra++;
    }
    Serial.println(">>> Road found, driving");
    waitMs(200);
  } else if (!aborted()) {
    stateName = "ESCAPE";                    // boxed in: never sit still
    Serial.println(">>> Boxed in, escaping");
    beep(500);
    setTarget(-AUTO_SPEED, -AUTO_SPEED);
    waitMs(BACKUP_MS * 2);
    stopMotors();
    waitMs(250);
    for (int i = 0; i < MAX_STEPS / 2 && !aborted(); i++) {
      turnStep(lastDir);
      waitMs(60);
    }
    waitMs(200);
  }

  avoiding = false;
  if (aborted()) stopMotors();
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 1500) { }

  pinMode(L_EN, OUTPUT);  pinMode(L_IN1, OUTPUT);  pinMode(L_IN2, OUTPUT);
  pinMode(R_EN, OUTPUT);  pinMode(R_IN3, OUTPUT);  pinMode(R_IN4, OUTPUT);
  analogWriteFreq(1000);
  stopMotors();

  pinMode(PIN_TRIG, OUTPUT);  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_IR1, INPUT);    pinMode(PIN_IR2, INPUT);
  pinMode(PIN_BUZZ, OUTPUT);  pinMode(PIN_LED_G, OUTPUT);  pinMode(PIN_LED_R, OUTPUT);

  analogReadResolution(12);

  Wire.setSDA(PIN_SDA);
  Wire.setSCL(PIN_SCL);
  Wire.begin();

  bmpOk = bmp.begin(0x76) || bmp.begin(0x77);
  initMag();
  dht.begin();

  delay(500);
  calibrateACS();                            // motors are off, so this reads the sensor zero
  battV = USE_BATTERY_SENSOR ? readBattV() : 0;

  Serial.println();
  Serial.println("=== BOOT: ARES Rover - full firmware ===");
  Serial.print("BMP280: ");  Serial.println(bmpOk ? "found" : "NOT found");
  Serial.print("Compass: ");
  Serial.println(magType == 1 ? "QMC5883L" : (magType == 2 ? "HMC5883L" : "NOT found"));
  Serial.print("ACS712 zero: "); Serial.print(acsZero, 3); Serial.println(" V");

  WiFi.softAP(AP_SSID, AP_PASS);
  server.on("/", handleRoot);
  server.on("/m", handleMove);
  server.on("/mode", handleMode);
  server.on("/s", handleStatus);
  server.on("/log", handleLog);
  server.on("/horn", handleHorn);
  server.on("/ping", handlePing);
  server.begin();

  Serial.print("Wi-Fi: "); Serial.println(AP_SSID);
  Serial.print("Open http://"); Serial.println(WiFi.softAPIP());

  for (int i = 0; i < 2; i++) {              // ready: 2 short beeps
    digitalWrite(PIN_BUZZ, HIGH); delay(100);
    digitalWrite(PIN_BUZZ, LOW);  delay(120);
  }

  mode = MODE_MANUAL;
  rp2040.wdt_begin(8000);                    // watchdog: restarts the Pico if the code freezes for 8 s
}

// ================= LOOP =================
void loop() {
  housekeeping();

  if (mode == MODE_AUTO) {
    if (lowBatt) {                           // autonomous driving never continues on a low battery
      Serial.println(">>> Low battery: leaving AUTO mode");
      setMode(MODE_STANDBY);
      return;
    }
    bool danger = (frontDist < STOP_DISTANCE_CM) || irL || irR;
    if (danger) {
      avoid();
    } else {
      stateName = "FORWARD";
      setTarget(AUTO_SPEED, AUTO_SPEED);
    }
  }
}