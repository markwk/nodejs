/**
 * Don't use this code, its nasty, nasty proof-of-concept stuff only.
 * It will eat your lunch and kill your kittens.
 */
var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    express = require('express'),
    io = require(__dirname + '/socket_io/lib/socket.io'),
    sys = require(process.binding('natives').util ? 'util' : 'sys'),
    vm = require('vm');

try {
  var drupalSettings = vm.runInThisContext(fs.readFileSync(__dirname + '/nodejs.config.js'));
  drupalSettings.serverStatsUrl = '/nodejs/stats/server';
  drupalSettings.getActiveChannelsUrl = '/nodejs/stats/channels';
  drupalSettings.kickUserUrl = '/nodejs/user/kick/:uid';
  drupalSettings.addUserToChannel = '/nodejs/user/channel/add/:channel/:uid';
  drupalSettings.removeUserFromChannel = '/nodejs/user/channel/remove/:channel/:uid';
}
catch (exception) {
  console.log("Failed to read config file, exiting: " + exception);
  process.exit(1);
}

/**
 * Http callback - read in a JSON message and publish it to interested clients.
 */
var publishMessage = function (request, response) {
  var sentCount = 0;
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    try {
      var publish_message = JSON.parse(chunk);
    }
    catch (exception) {
      console.log("Invalid JSON '" + chunk + "': " + exception);
      response.send({error: "Invalid JSON, error: " + e.toString()});
      return;
    }
    if (publish_message.broadcast) {
      console.log('Broadcasting to ' + publish_message.channel);
      socket.broadcast(chunk);
      sentCount = socket.clients.length;
    }
    else {
      sentCount = publishMessageToChannel(publish_message, chunk);
    }
  });
  response.send({sent: sentCount});
}

/**
 * Publish a message to clients subscribed to a channel.
 */
var publishMessageToChannel = function (jsonObject, jsonString) {
  var clientCount = 0;
  if (socket.channels[jsonObject.channel]) {
    for (var sessionId in socket.channels[jsonObject.channel]) {
      if (socket.clients[sessionId]) {
        socket.clients[sessionId].send(jsonString);
        clientCount++;
      }
    }
    console.log('Sent message to ' + clientCount + ' clients in channel "' + jsonObject.channel + '"');
  }
  else {
    console.log('No channel "' + jsonObject.channel + '" to send to');
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
    clients.push({'uid': socket.authenticatedClients[sessionId], 'sessionId': sessionId});
  }
  var stats = {
    'channels': channels,
    'totalClientCount': socket.clients.length,
    'authenticatedClients': clients
  };
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
    socket.channels[channel] = socket.channels[channel] || {};
    var sessionIds = getNodejsSessionIdsFromUid(uid);
    if (sessionIds.length > 0) {
      for (var i in sessionIds) {
        socket.channels[channel][sessionIds[i]] = sessionIds[i];
      }
      console.log("Added channel '" + channel + "' to sessionIds " + sessionIds.join());
      response.send({'status': 'success'});
    }
    else {
      console.log("No active sessions for uid: " + uid);
      response.send({'status': 'failed', 'error': 'No active sessions for uid.'});
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
        if (socket.channels[channel][sessionIds[i]]) {
          delete socket.channels[channel][sessionIds[i]];
        }
      }
      console.log("Successfully removed uid '" + uid + "' from channel '" + channel + "'");
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
  console.log("adding channels for uid " + authData.uid + ': ' + authData.channels.toString());
  for (var i in authData.channels) {
    socket.channels[authData.channels[i]] = socket.channels[authData.channels[i]] || {};
    socket.channels[authData.channels[i]][sessionId] = sessionId;
  }
}

var server = express.createServer();
server.post(drupalSettings.publishUrl, publishMessage)
  .get(drupalSettings.serverStatsUrl, returnServerStats)
  .get(drupalSettings.getActiveChannelsUrl, getActiveChannels)
  .get(drupalSettings.kickUserUrl, kickUser)
  .get(drupalSettings.addUserToChannel, addUserToChannel)
  .get(drupalSettings.removeUserFromChannel, removeUserFromChannel)
  .get('*', send404)
  .listen(drupalSettings.port, drupalSettings.host);

var socket = io.listen(server, {port: drupalSettings.port, resource: drupalSettings.resource});
socket.channels = {};
socket.authenticatedClients = {};

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
      console.log('Reusing existing authentication data for key "' + message.authkey + '"');
      setupClientConnection(client.sessionId, socket.authenticatedClients[message.authkey]);
      return;
    }
    var options = {
      port: drupalSettings.backend.port,
      host: drupalSettings.backend.host,
      path: drupalSettings.backend.authPath + message.authkey
    };
    http.get(options, function (response) {
      response.on('data', function (chunk) {
        response.setEncoding('utf8');
        var auth_data = false;
        try {
          auth_data = JSON.parse(chunk);
        }
        catch (exception) {
          console.log('Failed to parse authentication message: ' + exception);
          return;
        }
        if (auth_data.nodejs_valid_auth_key) {
          console.log("Valid login for uid: " + auth_data.uid);
          socket.authenticatedClients[message.authkey] = auth_data;
          setupClientConnection(client.sessionId, auth_data);
        }
        else {
          console.log("Invalid login for uid " + auth_data.uid);
          delete socket.authenticatedClients[message.authkey];
        }
      });
    }).on('error', function(exception) {
      console.log(exception);
    });
  });
}).on('error', function(exception) {
  console.log(exception);
});

