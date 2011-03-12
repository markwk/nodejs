Node.js integration
===================

This module adds Node.js integration to Drupal.

It is currently pre-alpha, use at your own risk. It will eat your lunch and kill your kittens.

Setup
=====

Node.js server:
  1. Install Node.js.
  2. Install Express module.
  3. Install Socket.Io module.
  4. Copy 'server.js' to a directory dedicated to the Node.js server used by Drupal.
  5. Copy 'nodejs.config.js.example' to 'nodejs.config.js' in the same directory, and edit values to taste.
  6. Run the following command
<code>
sudo node server.js
</code>

Drupal server:
  1. Install Socket.Io to 'path/to/nodejs/socket_io' (nodejs module directory).
  2. Activate at least nodejs module.
  3. Configure it. 
  4. ...
  5. Profit!
