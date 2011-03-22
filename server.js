/**
 * Provides Node.js - Drupal integration. 
 *
 * This code is alpha quality.
 *
 * Expect bugs, big API changes, etc.
 */

var http = require('http'),
    https = require('https'),
    url = require('url'),
    fs = require('fs'),
    express = require('express'),
    io = require('socket.io'),
    sys = require(process.binding('natives').util ? 'util' : 'sys'),
    vm = require('vm');

try {
  var backendSettings = vm.runInThisContext(fs.readFileSync(__dirname + '/nodejs.config.js'));
  backendSettings.serverStatsUrl = '/nodejs/stats/server';
  backendSettings.getActiveChannelsUrl = '/nodejs/stats/channels';
  backendSettings.kickUserUrl = '/nodejs/user/kick/:uid';
  backendSettings.addUserToChannelUrl = '/nodejs/user/channel/add/:channel/:uid';
  backendSettings.removeUserFromChannelUrl = '/nodejs/user/channel/remove/:channel/:uid';
  backendSettings.toggleDebugUrl = '/nodejs/debug/toggle';
}
catch (exception) {
  console.log("Failed to read config file, exiting: " + exception);
  process.exit(1);
}

/**
 * Authenticate a client connection based on the message it sent.
 */
function authenticateClient(client, message) {
  var options = {
    port: backendSettings.backend.port,
    host: backendSettings.backend.host,
    path: backendSettings.backend.authPath + message.authkey
  };
  var response;
  if (backendSettings.backend.scheme == 'https') {
    response = https.get(options, authenticateClientCallback);
  }
  else {
    response = http.get(options, authenticateClientCallback);
  }
  function authenticateClientCallback(response) {
    response.on('data', function (chunk) {
      response.setEncoding('utf8');
      var authData = false;
      try {
        authData = JSON.parse(chunk);
      }
      catch (exception) {
        console.log('Failed to parse authentication message: ' + exception);
        return;
      }
      if (!checkServiceKey(authData.serviceKey)) {
        console.log('Invalid service key "' + authData.serviceKey + '"');
        return;
      }
      if (authData.nodejs_valid_auth_key) {
        if (backendSettings.debug) {
          console.log("Valid login for uid: " + authData.uid);
        }
        socket.authenticatedClients[message.authkey] = authData;
        setupClientConnection(client.sessionId, authData);
      }
      else {
        console.log('Invalid login for uid "' + authData.uid + '"');
        delete socket.authenticatedClients[message.authkey];
      }
    }).on('error', function(exception) {
      console.log("Error hitting backend with authentication token: " + exception);
    });
  }
}

/**
 * Callback that wraps all requests and checks for a valid service key.
 */
var checkServiceKeyCallback = function (request, response, next) {
  if (checkServiceKey(request.header('Nodejs-Service-Key', ''))) {
    next();
  }
  else {
    response.send({'error': 'Invalid service key.'});
  }
}

/**
 * Check a service key against the configured service key.
 */
var checkServiceKey = function (serviceKey) {
  if (backendSettings.serviceKey && serviceKey != backendSettings.serviceKey) {
    console.log('Invalid service key "' + serviceKey + '", expecting "' + backendSettings.serviceKey + '"');
    return false;
  }
  return true;
}

/**
 * Http callback - set the debug flag.
 */
var toggleDebug = function (request, response) {
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    try {
      var toggle = JSON.parse(chunk);
      backendSettings.debug = toggle.debug;
      response.send({debug: toggle.debug});
    }
    catch (exception) {
      console.log('Invalid JSON "' + chunk + '": ' + exception);
      response.send({error: 'Invalid JSON, error: ' + e.toString()});
    }
  });
}

/**
 * Http callback - read in a JSON message and publish it to interested clients.
 */
var publishMessage = function (request, response) {
  var sentCount = 0;
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    try {
      var message = JSON.parse(chunk);
      if (backendSettings.debug) {
        console.log('publishMessage: message --> ' + message);
      }
    }
    catch (exception) {
      console.log('Invalid JSON "' + chunk + '": ' + exception);
      response.send({error: 'Invalid JSON, error: ' + e.toString()});
      return;
    }
    if (message.broadcast) {
      if (backendSettings.debug) {
        console.log('Broadcasting to ' + message.channel);
      }
      socket.broadcast(chunk);
      sentCount = socket.clients.length;
    }
    else {
      sentCount = publishMessageToChannel(message, chunk);
    }
    response.send({sent: sentCount});
  });
}

/**
 * Publish a message to clients subscribed to a channel.
 */
var publishMessageToChannel = function (message, jsonString) {
  var clientCount = 0;
  if (socket.channels[message.channel]) {
    for (var sessionId in socket.channels[message.channel].sessionIds) {
      console.log(message.channel + ':' + sessionId);
      if (socket.clients[sessionId]) {
        socket.clients[sessionId].send(jsonString);
        clientCount++;
      }
    }
    if (backendSettings.debug) {
      console.log('Sent message to ' + clientCount + ' clients in channel "' + message.channel + '"');
    }
  }
  else {
    console.log('No channel "' + message.channel + '" to send to');
  }
  return clientCount;
}

/**
 * Sends a 404 message.
 */
var send404 = function(request, response) {
  response.send('Not Found.', 404);
};

/**
 * Kicks the given logged in user from the server.
 */
var kickUser = function(request, response) {
  if (request.params.uid) {
    // Delete the user from the authenticatedClients hash.
    for (var authToken in socket.authenticatedClients) {
      if (socket.authenticatedClients[authToken].uid == request.params.uid) {
        delete socket.authenticatedClients[authToken];
      }
    }
    // Destroy any socket connections associated with this uid.
    for (var clientId in socket.clients) {
      if (socket.clients[clientId].uid == request.params.uid) {
        delete socket.clients[clientId];
        if (backendSettings.debug) {
          console.log('kickUser: deleted socket "' + clientId + '" for uid "' + request.params.uid + '"');
        }
      }
    }
    response.send({'status': 'success'});
    return;
  }
  console.log('Failed to kick user, no uid supplied');
  response.send({'status': 'failed', 'error': 'missing uid'});
};

/**
 * Return a list of active channels.
 */
var getActiveChannels = function(request, response) {
  var channels = {};
  for (var channel in socket.channels) {
    channels[channel] = channel;
  }
  if (backendSettings.debug) {
    console.log('getActiveChannels: returning channels --> ' . channels.toString());
  }
  response.send(channels);
};

/**
 * Return summary info about the server.
 */
var returnServerStats = function(request, response) {
  var channels = [], clients = [];
  for (var channel in socket.channels) {
    channels.push(channel);
  }
  for (var sessionId in socket.authenticatedClients) {
    clients.push({'user': socket.authenticatedClients[sessionId], 'sessionId': sessionId});
  }
  var stats = {
    'channels': channels,
    'totalClientCount': socket.clients.length,
    'authenticatedClients': clients
  };
  if (backendSettings.debug) {
    console.log('returnServerStats: returning server stats --> ' . stats.toString());
  }
  response.send(stats);
};

/**
 * Get the list of Node.js sessionIds for a given uid.
 */
var getNodejsSessionIdsFromUid = function(uid) {
  var sessionIds = [];
  for (var sessionId in socket.clients) {
    if (socket.clients[sessionId].uid == uid) {
      sessionIds.push(sessionId);
    }
  }
  return sessionIds;
}

/**
 * Add a use to a channel.
 */
var addUserToChannel = function(request, response) {
  var uid = request.params.uid || '';
  var channel = request.params.channel || '';
  if (uid && channel) {
    if (!/^\d+$/.test(uid)) {
      console.log("Invalid uid: " + uid);
      response.send({'status': 'failed', 'error': 'Invalid uid.'});
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(channel)) {
      console.log("Invalid channel: " + channel);
      response.send({'status': 'failed', 'error': 'Invalid channel name.'});
      return;
    }
    socket.channels[channel] = socket.channels[channel] || {'sessionIds': {}};
    var sessionIds = getNodejsSessionIdsFromUid(uid);
    if (sessionIds.length > 0) {
      for (var i in sessionIds) {
        socket.channels[channel].sessionIds[sessionIds[i]] = sessionIds[i];
      }
      if (backendSettings.debug) {
        console.log("Added channel '" + channel + "' to sessionIds " + sessionIds.join());
      }
      response.send({'status': 'success'});
    }
    else {
      console.log("No active sessions for uid: " + uid);
      response.send({'status': 'failed', 'error': 'No active sessions for uid.'});
    }
    for (var authKey in socket.authenticatedClients) {
      if (socket.authenticatedClients[authKey].uid == uid) {
        if (socket.authenticatedClients[authKey].channels.indexOf(channel) != -1) {
          socket.authenticatedClients[authKey].channels.push(channel);
        }
      }
    }
  }
  else {
    console.log("Missing uid or channel");
    response.send({'status': 'failed', 'error': 'Missing uid or channel'});
  }
};

/**
 * Remove a user from a channel.
 */
var removeUserFromChannel = function(request, response) {
  var uid = request.params.uid || '';
  var channel = request.params.channel || '';
  if (uid && channel) {
    if (!/^\d+$/.test(uid)) {
      console.log('Invalid uid: ' + uid);
      response.send({'status': 'failed', 'error': 'Invalid uid.'});
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(channel)) {
      console.log('Invalid channel: ' + channel);
      response.send({'status': 'failed', 'error': 'Invalid channel name.'});
      return;
    }
    if (socket.channels[channel]) {
      var sessionIds = getNodejsSessionIdsFromUid(uid);
      for (var i in sessionIds) {
        if (socket.channels[channel].sessionIds[sessionIds[i]]) {
          delete socket.channels[channel].sessionIds[sessionIds[i]];
        }
      }
      for (var authKey in socket.authenticatedClients) {
        if (socket.authenticatedClients[authKey].uid == uid) {
          var index = socket.authenticatedClients[authKey].channels.indexOf(channel);
          if (index != -1) {
            delete socket.authenticatedClients[authKey].channels[index];
          }
        }
      }
      if (backendSettings.debug) {
        console.log("Successfully removed uid '" + uid + "' from channel '" + channel + "'");
      }
      response.send({'status': 'success'});
    }
    else {
      console.log("Non-existent channel name '" + channel + "'");
      response.send({'status': 'failed', 'error': 'Non-existent channel name.'});
      return;
    }
  }
  else {
    console.log("Missing uid or channel");
    response.send({'status': 'failed', 'error': 'Invalid data'});
  }
}

/**
 * Setup a socket.clients{}.connection with uid, channels etc.
 */
var setupClientConnection = function(sessionId, authData) {
  socket.clients[sessionId].authKey = authData.authKey;
  socket.clients[sessionId].uid = authData.uid;
  if (backendSettings.debug) {
    console.log("adding channels for uid " + authData.uid + ': ' + authData.channels.toString());
  }
  for (var i in authData.channels) {
    socket.channels[authData.channels[i]] = socket.channels[authData.channels[i]] || {'sessionIds': {}};
    socket.channels[authData.channels[i]].sessionIds[sessionId] = sessionId;
  }
}

var server;
if (backendSettings.scheme == 'https') {
  if (backendSettings.debug) {
    console.log('Starting https server.');
  }
  server = express.createServer({
    key: fs.readFileSync(backendSettings.key),
    cert: fs.readFileSync(backendSettings.cert)
  });
}
else {
  if (backendSettings.debug) {
    console.log('Starting http server.');
  }
  server = express.createServer();
}
server.all('/nodejs/*', checkServiceKeyCallback)
  .post(backendSettings.publishUrl, publishMessage)
  .get(backendSettings.serverStatsUrl, returnServerStats)
  .get(backendSettings.getActiveChannelsUrl, getActiveChannels)
  .get(backendSettings.kickUserUrl, kickUser)
  .get(backendSettings.addUserToChannelUrl, addUserToChannel)
  .get(backendSettings.removeUserFromChannelUrl, removeUserFromChannel)
  .get(backendSettings.toggleDebugUrl, toggleDebug)
  .get('*', send404)
  .listen(backendSettings.port, backendSettings.host);

var socket = io.listen(server, {port: backendSettings.port, resource: backendSettings.resource});
socket.channels = {};
socket.authenticatedClients = {};
socket.statistics = {};

socket.on('connection', function(client) {
  client.on('message', function(messageString) {
    var message = false;
    try {
      message = JSON.parse(messageString);
    }
    catch (exception) {
      console.log('Failed to parse authentication message: ' + exception);
      return;
    } 
    if (socket.authenticatedClients[message.authkey]) {
      if (backendSettings.debug) {
        console.log('Reusing existing authentication data for key "' + message.authkey + '"');
      }
      setupClientConnection(client.sessionId, socket.authenticatedClients[message.authkey]);
    }
    else {
      authenticateClient(client, message);
    }
  });
}).on('error', function(exception) {
  console.log(exception);
});

