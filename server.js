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
    server,
    authenticatedClients = {},
    send404,
    publishMessage,
    publishMessageToChannel,
    socket;

try {
  var drupalSettings = vm.runInThisContext(fs.readFileSync(__dirname + '/nodejs.config.js'));
}
catch (e) {
  console.log("Failed to read config file, exiting: " + e);
  process.exit(1);
}

publishMessage = function (request, response) {
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    var publish_message = JSON.parse(chunk);
    if (publish_message.broadcast) {
      console.log('broadcasting to ' + publish_message.channel);
      socket.broadcast(chunk);
    }
    else {
      publishMessageToChannel(publish_message, chunk);
    }
  });
  response.writeHead(200, {'Content-Type': 'text/plain'});
}

publishMessageToChannel = function (jsonObject, jsonString) {
  if (socket.channels[jsonObject.channel]) {
    console.log('sending to channel ' + jsonObject.channel);
    for (var sessionId in socket.clients) {
      console.log('looking for session ' + sessionId);
      if (sessionId in socket.channels[jsonObject.channel]) {
        socket.clients[sessionId].send(jsonString);
        console.log('found session ' + sessionId + ' sending message');
      }
    }
  }
  else {
    console.log('no channel to send to: ' + jsonObject.channel);
  }
}

/**
 * Sends a 404 message.
 */
send404 = function(request, response) {
  response.send('Not Found.', 404);
};

/**
 * Kicks the given logged in user from the server.
 */
kickUser = function(request, response) {
  if (request.params.userId) {
    response.send({'status': 'success'});
  }
  else {
    response.send({'status': 'failed', 'error': 'Unknown user'});
  }
};

/**
 * Kicks the client matched to the given sessionId from the server.
 */
kickAnonUser = function(request, response) {
  if (request.params.sessionId) {
    response.send({'status': 'success'});
  }
  else {
    response.send({'status': 'failed', 'error': 'Unknown session'});
  }
};

/**
 * Bans the given user from the server.
 */
banUser = function(request, response) {
  response.send({'status': 'success'});
};

/**
 * Return a summary of all channels, or more details about a single channel.
 */
returnChannelStats = function(request, response) {
  var stats = {
    'userCount': 53,
    'clientCount': 53,
    'created': '',
  };
  response.send(stats);
};

/**
 * Return summary info about the server.
 */
returnServerStats = function(request, response) {
  var stats = {
    'userCount': 53,
    'clientCount': 53,
    'channelCount': 53,
    'uptime': '',
    'memory': ''
  };
  response.send(stats);
};

/**
 * Return a summary of all users, or more details about a single user.
 */
returnUserStats = function(request, response) {
  var stats = {};
  if (request.params.userId) {
    stats.user = {
      'id': '',
      'channels': [],
      'lastAuthCheck': '',
      'sessionIds': [],
      'lastKickTime': '',
      'banned': ''
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

drupalSettings.serverStatsUrl = '/nodejs/stats/server';
drupalSettings.userStatsUrl = '/nodejs/stats/user/:sessionId?';
drupalSettings.channelStatsUrl = '/nodejs/stats/channel/:channelName?';
drupalSettings.kickUserUrl = '/nodejs/user/kick/:sessionId';

server = express.createServer();
server.get(drupalSettings.publishUrl, publishMessage);
server.get(drupalSettings.serverStatsUrl, returnServerStats);
server.get(drupalSettings.userStatsUrl, returnUserStats);
server.get(drupalSettings.channelStatsUrl, returnChannelStats);
server.get(drupalSettings.kickUserUrl, kickUser);
server.get('*', send404);

server.listen(drupalSettings.port, drupalSettings.host);

socket = io.listen(server, {port: drupalSettings.port, resource: drupalSettings.resource});
socket.channels = {};

socket.on('connection', function(client) {
  client.on('message', function(message) {
    message = JSON.parse(message);
    console.log('authkey: ' + message.authkey);
    if (authenticatedClients[message.authkey]) {
      console.log('reusing existing authkey: ' + message.authkey);
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
        catch (e) {
          console.log(e);
          return;
        }
        if (auth_data.nodejs_valid_auth_key) {
          console.log("got valid login for uid " + auth_data.uid);
          authenticatedClients[message.authkey] = auth_data.uid;
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
  });
  client.on('disconnect', function() {
    console.log('disconnect from client ' + client.sessionId);
  });
}).on('error', function(client) {
  console.log('error: ' . client);
});

