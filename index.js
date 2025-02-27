import { Extension, Readme, Service } from "talkops";

const extension = new Extension("Domoticz");

extension.setDockerRepository("bierdok/talkops-extension-domoticz");

extension.setDescription(`
This Extension based on [Domoticz](https://www.domoticz.com/) allows you to control connected devices by voice in **realtime**.

![Screenshot](screenshot.png)
`);

extension.setInstallationGuide(`
1. Enable the API in Domoticz: \`Setup → Settings → Security\`
2. Create a new user specifically for the TalkOps integration: \`Setup → Users\`
3. Grant this user access to the devices you want to control by voice: \`Set Devices\`
4. Set the environment variables using the credentials of the newly created user.
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

import updateLightsFunction from "./schemas/functions/update_lights.json" assert { type: "json" };
import updateSceneFunction from "./schemas/functions/update_scene.json" assert { type: "json" };
import updateShuttersFunction from "./schemas/functions/update_shutters.json" assert { type: "json" };

import lightsModel from "./schemas/models/lights.json" assert { type: "json" };
import scenesModel from "./schemas/models/scenes.json" assert { type: "json" };
import sensorsModel from "./schemas/models/sensors.json" assert { type: "json" };
import shuttersModel from "./schemas/models/shutters.json" assert { type: "json" };

const baseInstructions = `
You are a home automation assistant, focused solely on managing connected devices in the home.
When asked to calculate an average, **round to the nearest whole number** without explaining the calculation.
`;

const defaultInstructions = `
Currently, no connected devices have been assigned to you.
Your sole task is to ask the user to install one or more connected devices in the home before proceeding.
`;

async function apiGet(endpoint) {
  const response = await axios.get(`${process.env.BASE_URL}${endpoint}`, {
    auth: {
      username: process.env.USERNAME,
      password: process.env.PASSWORD,
    },
  });
  return response.data;
}

let devices = null;

async function updateDevices() {
  const rooms = [];
  const lights = [];
  const shutters = [];
  const sensors = [];
  const scenes = [];

  const p = await apiGet("/json.htm?type=command&param=getsettings");

  const ss = await apiGet("/json.htm?type=command&param=getscenes");
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

  const fps = await apiGet("/json.htm?type=command&param=getfloorplans");
  if (fps.result) {
    for (const fp of fps.result) {
      const fpps = await apiGet(
        `/json.htm?type=command&param=getfloorplanplans&idx=${fp.idx}`
      );
      if (fpps.result) {
        for (const fpp of fpps.result) {
          fpp.floor = fp.idx;
          rooms.push({
            id: fpp.idx,
            name: fpp.Name,
            floor: fp.Name,
          });
        }
      }
    }
  }

  const ds = await apiGet("/json.htm?type=command&param=getdevices");
  if (ds.result) {
    for (const d of ds.result) {
      let room = null;
      let floor = null;
      let pid = d.PlanIDs.filter((value) => value !== 0)[0];
      if (pid) {
        pid = pid.toString();
        for (const r of rooms) {
          if (r.id === pid) {
            room = r.name;
            floor = r.floor;
          }
        }
      }
      const names = d.Name.split(" - ");
      if (d.SwitchType === "On/Off") {
        lights.push({
          id: d.idx,
          state: d.Status === "On" ? "on" : "off",
          place: d.Description || names[names.length - 1],
          room: room || names[0],
          floor,
        });
      } else if (d.SwitchType === "Blinds") {
        shutters.push({
          id: d.idx,
          state: d.Status === "Open" ? "opened" : "closed",
          place: d.Description || names[names.length - 1],
          room: room || names[0],
          floor,
        });
      } else if (d.Type.startsWith("Temp")) {
        sensors.push({
          id: d.idx,
          temperature: d.Temp !== undefined ? d.Temp : null,
          temperature_unit: `°${p.TempUnit === 1 ? "F" : "C"}`,
          humidity: d.Humidity !== undefined ? d.Humidity : null,
          pressure: d.Barometer !== undefined ? d.Barometer : null,
          room: room === null ? d.Name : room,
          floor,
        });
      }
    }
  }
  return { lights, shutters, sensors, scenes };
}

async function refresh() {
  const v = await apiGet("/json.htm?type=command&param=getversion");
  extension.setVersion(v.version);

  extension.errors = []
  try {
    devices = await updateDevices();
  } catch (e) {
    extension.errors.push(e.message);
    devices = null;
  }

  extension.setInstructions(async () => {
    const instructions = [];
    instructions.push(baseInstructions);
    if (
      !devices ||
      (devices.lights.length === 0 &&
        devices.shutters.length === 0 &&
        devices.sensors.length === 0 &&
        devices.scenes.length === 0)
    ) {
      instructions.push(defaultInstructions);
    } else {
      if (devices.lights.length) {
        instructions.push("# Lights");
        instructions.push(`* Model: ${JSON.stringify(lightsModel)}`);
        instructions.push(`* Data: ${JSON.stringify(devices.lights)}`);
      }
      if (devices.scenes.length) {
        instructions.push("# Scenes");
        instructions.push(`* Model: ${JSON.stringify(scenesModel)}`);
        instructions.push(`* Data: ${JSON.stringify(devices.scenes)}`);
      }
      if (devices.sensors.length) {
        instructions.push("# Sensors");
        instructions.push(`* Model: ${JSON.stringify(sensorsModel)}`);
        instructions.push(`* Data: ${JSON.stringify(devices.sensors)}`);
      }
      if (devices.shutters.length) {
        instructions.push("# Shutters");
        instructions.push(`* Model: ${JSON.stringify(shuttersModel)}`);
        instructions.push(`* Data: ${JSON.stringify(devices.shutters)}`);
      }
    }
    return instructions;
  });

  extension.setFunctionSchemas(() => {
    const functionSchemas = [];
    if (devices) {
      if (devices.lights.length) {
        functionSchemas.push(updateLightsFunction);
      }
      if (devices.scenes.length) {
        functionSchemas.push(updateSceneFunction);
      }
      if (devices.shutters.length) {
        functionSchemas.push(updateShuttersFunction);
      }
    }
    return functionSchemas;
  });

  setTimeout(refresh, 10000);
}
if (extension.errors.length === 0) {
  refresh();
}

extension.setFunctions([
  async function update_lights(action, ids) {
    try {
      for (const id of ids) {
        const response = await apiGet(
          `/json.htm?type=command&param=switchlight&idx=${id}&switchcmd=${action}`
        );
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
        const response = await apiGet(
          `/json.htm?type=command&param=switchlight&idx=${id}&switchcmd=${action}`
        );
        if (response.status === "ERR") {
          throw { message: "bad_request" };
        }
      }
      return `${action}ing.`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
  async function update_scene(action, id) {
    try {
      const response = await apiGet(
        `/json.htm?type=command&param=switchscene&idx=${id}&switchcmd=${action}`
      );
      if (response.status === "ERR") {
        throw { message: "bad_request" };
      }
      return "Done.";
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
]);

new Readme(process.env.README_TEMPLATE_URL, "/app/README.md", extension);
new Service(process.env.AGENT_URLS.split(","), extension);
