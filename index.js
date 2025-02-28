import { Extension, Readme, Service } from "talkops";

const extension = new Extension("Domoticz");

extension.setDockerRepository("bierdok/talkops-extension-domoticz");

extension.setDescription(`
This Extension based on [Domoticz](https://www.domoticz.com/) allows you to control connected devices by voice in **realtime**.

## Features
* Lights: Check status, turn on/off
* Shutters: Check status, open, close and stop
* Scene: Check status, enable, disable and toggle
* Sensors: Check status

## Screenshot
![Screenshot](screenshot.png)
`);

extension.setInstallationGuide(`
* Make sure your Domoticz version is newer than \`2023.2\`.
* Open Domoticz from a web browser with admin permissions.
* Enable the API: \`Setup → Settings → Security\`
* Create a new user specifically for the TalkOps integration: \`Setup → Users\`
* Grant this user access to the devices you want to control by voice: \`Set Devices\`
* Set the environment variables using the credentials of the newly created user.
`);

extension.setEnvironmentVariables({
  BASE_URL: {
    description: "The base URL of your Domoticz server.",
    possibleValues: ["http://domoticz:8080", "https://domoticz.mydomain.net"],
  },
  USERNAME: {
    description: "The username for authenticating with the Domoticz API.",
    defaultValue: "admin",
  },
  PASSWORD: {
    description: "The password related to username.",
    defaultValue: "domoticz",
  },
});

import axios from "axios";
import yaml from "js-yaml";

import floorsModel from "./schemas/models/floors.json" assert { type: "json" };
import roomsModel from "./schemas/models/rooms.json" assert { type: "json" };
import lightsModel from "./schemas/models/lights.json" assert { type: "json" };
import shuttersModel from "./schemas/models/shutters.json" assert { type: "json" };
import sensorsModel from "./schemas/models/sensors.json" assert { type: "json" };
import scenesModel from "./schemas/models/scenes.json" assert { type: "json" };

import updateLightsFunction from "./schemas/functions/update_lights.json" assert { type: "json" };
import updateScenesFunction from "./schemas/functions/update_scenes.json" assert { type: "json" };
import updateShuttersFunction from "./schemas/functions/update_shutters.json" assert { type: "json" };

const baseInstructions = `
You are a home automation assistant, focused solely on managing connected devices in the home.
When asked to calculate an average, **round to the nearest whole number** without explaining the calculation.
`;

const defaultInstructions = `
Currently, no connected devices have been assigned to you.
Your sole task is to ask the user to install one or more connected devices in the home before proceeding.
`;

async function request(param) {
  const response = await axios.get(
    `${process.env.BASE_URL}/json.htm?type=command&param=${param}`,
    {
      auth: {
        username: process.env.USERNAME,
        password: process.env.PASSWORD,
      },
    }
  );
  return response.data;
}

async function refresh() {
  extension.errors = [];
  let floors = [];
  let rooms = [];
  let lights = [];
  let shutters = [];
  let sensors = [];
  let scenes = [];

  try {
    const v = await request("getversion");
    extension.setVersion(v.version);

    const p = await request("getsettings");

    const fps = await request("getfloorplans");
    if (fps.result) {
      for (const fp of fps.result) {
        floors.push({
          id: parseInt(fp.idx),
          name: fp.Name,
        });
        const fpps = await request(`getfloorplanplans&idx=${fp.idx}`);
        if (fpps.result) {
          for (const fpp of fpps.result) {
            fpp.floor = fp.idx;
            rooms.push({
              id: parseInt(fpp.idx),
              name: fpp.Name,
              floor_id: parseInt(fp.idx),
            });
          }
        }
      }
    }
    const ds = await request("getdevices");
    if (ds.result) {
      for (const d of ds.result) {
        let room_id = null;
        let pid = d.PlanIDs.filter((value) => value !== 0)[0];
        if (pid) {
          room_id = pid;
        }
        if (d.SwitchType === "On/Off") {
          lights.push({
            id: parseInt(d.idx),
            name: d.Name,
            description: d.Description || null,
            state: d.Status === "On" ? "on" : "off",
            room_id,
          });
        } else if (
          d.SwitchType === "Blinds" ||
          d.SwitchType === "Blinds + Stop"
        ) {
          let state = "opened";
          if (d.Status === "Closed") state = "closed";
          if (d.Status === "Stopped") state = "unknown";
          shutters.push({
            id: parseInt(d.idx),
            name: d.Name,
            description: d.Description || null,
            state,
            room_id,
          });
        } else if (d.Type.startsWith("Temp")) {
          if (d.Temp !== undefined) {
            sensors.push({
              name: d.Name,
              description: d.Description || null,
              type: "temperature",
              value: `${d.Temp}`,
              unit: p.TempUnit === 1 ? "°F" : "°C",
              room_id,
            });
          }
          if (d.Humidity !== undefined) {
            sensors.push({
              name: d.Name,
              description: d.Description || null,
              type: "humidity",
              value: `${d.Humidity}`,
              unit: "%",
              room_id,
            });
          }
          if (d.Barometer !== undefined) {
            sensors.push({
              name: d.Name,
              description: d.Description || null,
              type: "pressure",
              value: `${d.Barometer}`,
              unit: "hPa",
              room_id,
            });
          }
        } else if (d.Type.startsWith("Air Quality")) {
          sensors.push({
            name: d.Name,
            description: d.Description || null,
            type: "air_quality",
            value: d.Data.replace(/ ppm$/, ""),
            unit: "ppm",
            room_id,
          });
        }
      }
    }
    const ss = await request("getscenes");
    if (ss.result) {
      for (const s of ss.result) {
        let state = null;
        if (s.Type === "Group") {
          state = s.Status === "On" ? "enabled" : "disabled";
        }
        scenes.push({
          id: s.idx,
          name: s.Name,
          state,
        });
      }
    }

    extension.setInstructions(() => {
      const instructions = [baseInstructions];

      if (
        !lights.length &&
        !shutters.length &&
        !sensors.length &&
        !scenes.length
      ) {
        instructions.push(defaultInstructions);
      } else {
        instructions.push("``` yaml");
        instructions.push(
          yaml.dump({
            floorsModel,
            roomsModel,
            lightsModel,
            shuttersModel,
            sensorsModel,
            scenesModel,
            floors,
            rooms,
            lights,
            shutters,
            sensors,
            scenes,
          })
        );
        instructions.push("```");
      }

      return instructions;
    });

    extension.setFunctionSchemas(() => {
      const functionSchemas = [];
      if (lights) {
        functionSchemas.push(updateLightsFunction);
      }
      if (scenes) {
        functionSchemas.push(updateScenesFunction);
      }
      if (shutters) {
        functionSchemas.push(updateShuttersFunction);
      }
      return functionSchemas;
    });
  } catch (err) {
    extension.errors = [err.message];
  }

  setTimeout(refresh, 5000);
}
if (extension.errors.length === 0) {
  refresh();
}

extension.setFunctions([
  async function update_lights(action, ids) {
    try {
      for (const id of ids) {
        const response = await request(`switchlight&idx=${id}&switchcmd=${action}`);
        if (response.status === "ERR") {
          throw { message: "bad_request" };
        }
      }
      return "Done.";
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
  async function update_shutters(action, ids) {
    try {
      for (const id of ids) {
        const response = await request(`switchlight&idx=${id}&switchcmd=${action}`);
        if (response.status === "ERR") {
          throw { message: "bad_request" };
        }
      }
      return `${action}ing.`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
  async function update_scenes(action, ids) {
    try {
      for (const id of ids) {
        const response = await request(`switchscene&idx=${id}&switchcmd=${action}`);
        if (response.status === "ERR") {
          throw { message: "bad_request" };
        }
      }
      return "Done.";
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
]);

new Readme(process.env.README_TEMPLATE_URL, "/app/README.md", extension);
new Service(process.env.AGENT_URLS.split(","), extension);
