# TalkOps Extension: Domoticz
![Docker Pulls](https://img.shields.io/docker/pulls/bierdok/talkops-extension-domoticz)

A TalkOps Extension made to work with [TalkOps](https://link.talkops.app/talkops).

This Extension based on [Domoticz](https://www.domoticz.com/) allows you to control connected devices ***by voice in real-time**.

## Features
* Lights: Check status, turn on/off
* Shutters: Check status, open, close and stop
* Scene: Check status, enable, disable and toggle
* Sensors: Check status

## Screenshot
![Screenshot](screenshot.png)

## Installation Guide

_[TalkOps](https://link.talkops.app/install-talkops) must be installed beforehand._

* Make sure your Domoticz version is newer than `2023.2`.
* Open Domoticz from a web browser with admin permissions.
* Enable the API: `Setup → Settings → Security`
* Create a new user specifically for the TalkOps integration: `Setup → Users`
* Grant this user access to the devices you want to control by voice: `Set Devices`
* Set the environment variables using the credentials of the newly created user.

## Integration Guide

Add the service and setup the environment variables if needed:

_compose.yml_
``` yml
name: talkops

services:
...
  talkops-extension-domoticz:
    image: bierdok/talkops-extension-domoticz
    environment:
      BASE_URL: [your-value]
    restart: unless-stopped
```

## Environment Variables

#### BASE_URL

The base URL of your Domoticz server.
* Possible values: `http://domoticz:8080` `https://domoticz.mydomain.net`

#### USERNAME

The username for authenticating with the Domoticz API.
* Default value: `admin`

#### PASSWORD

The password related to username.
* Default value: `domoticz`

#### AGENT_URLS

A comma-separated list of WebSocket server URLs for real-time communication with specified agents.
* Default value: `ws://talkops`
* Possible values: `ws://talkops1` `ws://talkops2`
