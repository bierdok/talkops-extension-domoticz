# TalkOps Extension: Boilerplate NodeJS

A TalkOps Extension made to work with [TalkOps](https://link.talkops.app/talkops).


## Installation Guide

Install [TalkOps](https://link.talkops.app/install-talkops).


## Integration Guide

Add the service and setup the environment variables if needed:

_compose.yml_
```
name: talkops

services:
...
  talkops-extension-boilerplate-nodejs:
    build:
      context: [dockerfile-path]
    restart: unless-stopped
```

## Environment Variables

#### AGENT_URLS

A comma-separated list of WebSocket server URLs for real-time communication with specified agents.
* Default value: `ws://talkops`

## Join the community

* [Discord](https://link.talkops.app/discord)
