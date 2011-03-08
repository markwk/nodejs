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
    vm = require('vm'),
    authenticatedClients = {};

try {
  var drupalSettings = vm.runInThisContext(fs.readFileSync(__dirname + '/nodejs.config.js'));
}
catch (exception) {
  console.log("Failed to read config file, exiting: " + exception);
  process.exit(1);
}

var publishMessage = function (request, response) {
  var sentCount = 0;
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    var publish_message = JSON.parse(chunk);
    if (publish_message.broadcast) {
      console.log('broadcasting to ' + publish_message.channel);
      socket.broadcast(chunk);
      sentCount = socket.clients.length;
    }
    else {
      sentCount = publishMessageToChannel(publish_message, chunk);
    }
  });
  response.writeHead(200, {'Content-Type': 'text/json'});
  response.send(JSON.stringify({sent: sentCount}));
}

var publishMessageToChannel = function (jsonObject, jsonString) {
  var clientCount = 0;
  if (socket.channels[jsonObject.channel]) {
    console.log('sending to channel ' + jsonObject.channel);
    for (var sessionId in socket.channels[jsonObject.channel]) {
      if (socket.clients[sessionId]) {
        socket.clients[sessionId].send(jsonString);
        console.log('found session ' + sessionId + ' sending message');
        clientCount++;
      }
    }
  }
  else {
    console.log('no channel to send to: ' + jsonObject.channel);
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
  if (request.params.userId) {
    console.log('attempting to kick user: ' + request.params.userId);
    for (var sessionId in authenticatedClients) {
      if (authenticatedClients[sessionId] == request.params.userId) {
        console.log('found user in authenticatedClients: ' + request.params.userId);
        for (var clientId in socket.clients) {
          console.log('checking client uid: ' + socket.clients[clientId].uid);
          if (socket.clients[clientId].uid == request.params.userId) {
            delete socket.clients[clientId];
            delete authenticatedClients[sessionId];
            console.log('found user in socket.clients, kicked off uid: ' + request.params.userId);
            response.send({'status': 'success'});
            return;
          }
        }
        console.log('failed to find client in socket.clients');
      }
    }
  }
  console.log('failed to kick user: unknown');
  response.send({'status': 'failed', 'error': 'Unknown user'});
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
  for (var sessionId in authenticatedClients) {
    clients.push({'uid': authenticatedClients[sessionId], 'sessionId': sessionId});
  }
  var stats = {
    'channels': channels,
    'totalClientCount': socket.clients.length,
    'authenticatedClients': clients
  };
  response.send(stats);
};

/**
 * Return a summary of all users, or more details about a single user.
 */
var returnUserStats = function(request, response) {
  var stats = {};
  if (request.params.userId) {
    stats.user = {
      'id': '',
      'channels': [],
      'lastAuthCheck': '',
      'sessionIds': [],
      'lastKickTime': '',
    };
  }
  else {
    stats.users = {
      'count': 53,
      'ids': []
    };
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
  var uid = request.params.userId || '';
  var channel = request.params.channel || '';
  if (uid && channel) {
    if (!/^\d+$/.test(uid)) {
      response.send({'status': 'failed', 'error': 'Invalid uid.'});
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(channel)) {
      response.send({'status': 'failed', 'error': 'Invalid channel name.'});
      return;
    }
    socket.channels[channel] = socket.channels[channel] || {};
    socket.channels[channel] = socket.channels[channel] || {};
    var sessionIds = getNodejsSessionIdsFromUid(uid);
    if (sessionIds.length > 0) {
      for (var i in sessionIds) {
        socket.channels[channel][sessionIds[i]] = sessionIds[i];
      }
      response.send({'status': 'success'});
    }
    else {
      response.send({'status': 'failed', 'error': 'No active sessions for uid.'});
    }
  }
  else {
    response.send({'status': 'failed', 'error': 'Invalid data'});
  }
};

/**
 * Add a use to a channel.
 */
var removeUserFromChannel = function(request, response) {
  var uid = request.params.userId || '';
  var channel = request.params.channel || '';
  if (uid && channel) {
    if (!/^\d+$/.test(uid)) {
      response.send({'status': 'failed', 'error': 'Invalid uid.'});
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(channel)) {
      response.send({'status': 'failed', 'error': 'Invalid channel name.'});
      return;
    }
    if (socket.channels[channel]) {
      var sessionIds = getNodejsSessionIdsFromUid(uid);
      for (var i in sessionIds) {
        if (socket.channels[channel][sessionIds[i]]) {
          delete socket.channels[channel][sessionIds[i]];
          console.log(socket.clients[sessionIds[i]]);
        }
      }
      response.send({'status': 'success'});
    }
    else {
      response.send({'status': 'failed', 'error': 'Nonexistent channel name.'});
      return;
    }
  }
  else {
    response.send({'status': 'failed', 'error': 'Invalid data'});
  }
}

drupalSettings.serverStatsUrl = '/nodejs/stats/server';
drupalSettings.userStatsUrl = '/nodejs/stats/user/:sessionId?';
drupalSettings.getActiveChannelsUrl = '/nodejs/stats/channels';
drupalSettings.kickUserUrl = '/nodejs/user/kick/:userId';
drupalSettings.addUserToChannel = '/nodejs/user/channel/add/:channel/:userId';
drupalSettings.removeUserFromChannel = '/nodejs/user/channel/remove/:channel/:userId';

var server = express.createServer();
server.post(drupalSettings.publishUrl, publishMessage);
server.get(drupalSettings.serverStatsUrl, returnServerStats);
server.get(drupalSettings.userStatsUrl, returnUserStats);
server.get(drupalSettings.getActiveChannelsUrl, getActiveChannels);
server.get(drupalSettings.kickUserUrl, kickUser);
server.get(drupalSettings.addUserToChannel, addUserToChannel);
server.get(drupalSettings.removeUserFromChannel, removeUserFromChannel);
server.get('*', send404);

server.listen(drupalSettings.port, drupalSettings.host);

var socket = io.listen(server, {port: drupalSettings.port, resource: drupalSettings.resource});
socket.channels = {};

socket.on('connection', function(client) {
  client.on('message', function(messageString) {
    var message = JSON.parse(messageString);
    console.log('authkey: ' + message.authkey);
    if (authenticatedClients[message.authkey]) {
      console.log('reusing existing authkey: ' + message.authkey + ' with uid ' + message.uid);
      socket.clients[client.sessionId].authKey = message.authKey;
      socket.clients[client.sessionId].uid = message.uid;
      for (var i = 0; i < message.channels.length; i++) {
        console.log("adding channels for uid " + message.uid + ' ' + message.channels[i]);
        socket.channels[message.channels[i]] = socket.channels[message.channels[i]] || {};
        socket.channels[message.channels[i]][client.sessionId] = client.sessionId;
      }
      return;
    }
    var options = {
      port: drupalSettings.backend.port,
      host: drupalSettings.backend.host,
      path: drupalSettings.backend.authPath + message.authkey
    };
    http.get(options, function (response) {
      response.setEncoding('utf8');
      response.on('data', function (chunk) {
        try {
          var auth_data = JSON.parse(chunk);
        }
        catch (exception) {
          console.log(exception);
          return;
        }
        if (auth_data.nodejs_valid_auth_key) {
          console.log("got valid login for uid " + auth_data.uid);
          authenticatedClients[message.authkey] = auth_data.uid;
          socket.clients[client.sessionId].authKey = message.authKey;
          socket.clients[client.sessionId].uid = auth_data.uid;
          for (var i = 0; i < message.channels.length; i++) {
            console.log("adding channels for uid " + auth_data.uid + ' ' + message.channels[i]);
            socket.channels[message.channels[i]] = socket.channels[message.channels[i]] || {};
            socket.channels[message.channels[i]][client.sessionId] = client.sessionId;
          }
        }
        else {
          console.log("got invalid login for uid " + auth_data.uid);
          delete authenticatedClients[message.authkey];
        }
      });
    }).on('error', function(e) {
      console.log("Got error: " + e.message);
    });
  }).on('disconnect', function() {
    console.log('disconnect from client ' + client.sessionId + ' ' + client.uid + ' ' + client.channels);
  });
}).on('error', function(exception) {
  console.log(exception);
});

