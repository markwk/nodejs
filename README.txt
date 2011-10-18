B1;2600;0cNode.js integration
===================

This module adds Node.js integration to Drupal 6.

It is currently alpha software, use at your own risk. It may eat your lunch and kill your kittens.

Setup
=====

Node.js server:
  1. Install Node.js.
  2. Install Express module. npm install express
  3. Install Socket.Io module. npm install socket.io
  4. Optionally, copy 'server.js' to a directory specific to the Node.js server
     used by Drupal.
  5. Copy 'nodejs.config.js.example' to 'nodejs.config.js' (in the same
     directory where server.js is located). Edit the values to taste.
  6. Run the node server with the command: node server.js

Drupal server:
  1. Install Socket.Io under socket_io in the nodejs module directory
     (i.e. 'sites/all/modules/nodejs/socket_io' should contain index.js).
  2. Activate the nodejs module and optionally sub-modules.
  3. Configure nodejs at Administration > Configuration > Node.js
  4. ...
  5. Profit!

