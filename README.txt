Node.js integration
===================

This module adds Node.js integration to Drupal.

It is currently alpha software, use at your own risk. It may eat your lunch and kill your kittens.

Setup
=====

Node.js server on Ubuntu:
  1. Make sure you have the prerequisites in your ubuntu
sudo apt-get install build-essential git curl openssl libssl-dev -y

  2. Install Node.js.
mkdir -p ~/local/src && cd ~/local/src && git clone git://github.com/joyent/node.git && cd node && ./configure && make && sudo make install

  3. Install npm module
curl http://npmjs.org/install.sh | sudo sh

  4. Install Express and Socket.Io modules.
sudo npm install express socket.io

  5. Optionally, copy 'server.js' to a directory specific to the Node.js server
     used by Drupal.

  6. Copy 'nodejs.config.js.example' to 'nodejs.config.js' (in the same
     directory where server.js is located). Edit the values to taste.

  7. Run the node server with the command: node server.js

Useful links:
  - how to turn nodejs into a service http://kevin.vanzonneveld.net/techblog/article/run_nodejs_as_a_service_on_ubuntu_karmic/

Drupal server:
  1. Install Socket.Io under socket_io in the nodejs module directory
     (i.e. 'sites/all/modules/nodejs/socket_io' should contain index.js).
  1b. Optionally you can create a symlink:
cd /var/www/sites/all/modules/nodejs && ln -s /usr/local/lib/node/.npm/socket.io/active/package/ socket_io

  2. Activate the nodejs module and optionally sub-modules.
  3. Configure nodejs at your Drupal page: Administration > Configuration > Node.js
  4. ...
  5. Profit!

