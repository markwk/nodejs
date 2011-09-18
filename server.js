/**
 * Provides Node.js - Drupal integration. 
 *
 * This code is beta quality.
 */

var http = require('http'),
    https = require('https'),
    url = require('url'),
    fs = require('fs'),
    express = require('express'),
    socket_io = require('socket.io'),
    util = require('util'),
    querystring = require('querystring'),
    vm = require('vm');

var channels = {},
    authenticatedClients = {},
    onlineUsers = {},
    presenceTimeoutIds = {},
    tokenChannels = {},
    extensions = [];

try {
  var backendSettings = vm.runInThisContext(fs.readFileSync(process.cwd() + '/nodejs.config.js'));
  backendSettings.extensions = backendSettings.extensions || [];
}
catch (exception) {
  console.log("Failed to read config file, exiting: " + exception);
  process.exit(1);
}

// Load server extensions
for (var i in backendSettings.extensions) {
  try {
    // Load JS files for extensions as modules, and collect the returned
    // object for each extension.
    extensions.push(require(__dirname + '/' + backendSettings.extensions[i]));
    console.log("Extension loaded: " + backendSettings.extensions[i]);
  }
  catch (exception) {
    console.log("Failed to load extension " + backendSettings.extensions[i] + " [" + exception + "]");
    process.exit(1);
  }
}

// Initialize other default settings
backendSettings.kickUserUrl = '/nodejs/user/kick/:uid';
backendSettings.logoutUserUrl = '/nodejs/user/logout/:authtoken';
backendSettings.addUserToChannelUrl = '/nodejs/user/channel/add/:channel/:uid';
backendSettings.removeUserFromChannelUrl = '/nodejs/user/channel/remove/:channel/:uid';
backendSettings.setUserPresenceListUrl = '/nodejs/user/presence-list/:uid/:uidList';
backendSettings.addAuthTokenToChannelUrl = '/nodejs/authtoken/channel/add/:channel/:uid';
backendSettings.removeAuthTokenFromChannelUrl = '/nodejs/authtoken/channel/remove/:channel/:uid';
backendSettings.toggleDebugUrl = '/nodejs/debug/toggle';
backendSettings.contentTokenUrl = '/nodejs/content/token';
backendSettings.publishMessageToContentChannelUrl = '/nodejs/content/token/message';

/**
 * Check if the given channel is client-writable.
 */
var channelIsClientWritable = function (channel) {
  if (channels.hasOwnProperty(channel)) {
    return channels[channel].isClientWritable;
  }
  return false;
}

/**
 * Send a message to the backend.
 */
var sendMessageToBackend = function (message, callback) {
  var requestBody = querystring.stringify({
        messageJson: JSON.stringify(message), 
        serviceKey: backendSettings.backend.serviceKey
      }),
      options = {
        port: backendSettings.backend.port,
        host: backendSettings.backend.host,
        headers: {
          'Content-Length': Buffer.byteLength(requestBody),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        agent: false,
        method: 'POST',
        agent: http.getAgent(backendSettings.backend.host, backendSettings.backend.port),
        path: backendSettings.backend.messagePath
      },
      scheme = backendSettings.backend.scheme,
      request;

  if (backendSettings.debug) {
    console.log("Sending message to backend", message, options);
  }
  request = scheme == 'http' ? http.request(options, callback) : https.request(options, callback);
  request.on('error', function (error) {
    console.log("Error sending message to backend:", error.message);
  });
  request.end(requestBody);
}

/**
 * Authenticate a client connection based on the message it sent.
 */
var authenticateClient = function (client, message) {
  // If the authToken is verified, initiate a connection with the client.
  if (authenticatedClients[message.authToken]) {
    if (backendSettings.debug) {
      console.log('Reusing existing authentication data for key:', message.authToken, ', client id:', client.id);
    }
    setupClientConnection(client.id, authenticatedClients[message.authToken], message.contentTokens);
  }
  else {
    message.messageType = 'authenticate';
    message.clientId = client.id;
    sendMessageToBackend(message, authenticateClientCallback);
  }
}

/**
 * Handle authentication call response.
 */
var authenticateClientCallback = function (response) {
  var requestBody = '';
  response.setEncoding('utf8');
  response.on('data', function (chunk) {
    requestBody += chunk;
  });
  response.on('end', function () {
    if (response.statusCode == 404) {
      if (backendSettings.debug) {
        console.log('Backend authentication url not found, full response info:', response);
      }
      else {
        console.log('Backend authentication url not found.');
      }
      return;
    }
    var authData = false;
    try {
      authData = JSON.parse(requestBody);
    }
    catch (exception) {
      console.log('Failed to parse authentication message:', exception);
      if (backendSettings.debug) {
        console.log('Failed message string: ' + requestBody);
      }
      return;
    }
    if (!checkServiceKey(authData.serviceKey)) {
      console.log('Invalid service key "', authData.serviceKey, '"');
      return;
    }
    if (authData.nodejsValidAuthToken) {
      if (backendSettings.debug) {
        console.log('Valid login for uid "', authData.uid, '"');
      }
      setupClientConnection(authData.clientId, authData, authData.contentTokens);
      authenticatedClients[authData.authToken] = authData;
    }
    else {
      console.log('Invalid login for uid "', authData.uid, '"');
      delete authenticatedClients[authData.authToken];
    }
  });
}

/**
 * Send a presence notifcation for uid.
 */
var sendPresenceChangeNotification = function (uid, presenceEvent) {
  if (onlineUsers[uid]) {
    for (var i in onlineUsers[uid]) {
      var sessionIds = getNodejsSessionIdsFromUid(onlineUsers[uid][i]);
      if (sessionIds.length > 0 && backendSettings.debug) {
        console.log('Sending presence notification for', uid, 'to', onlineUsers[uid][i]);
      }
      for (var j in sessionIds) {
        io.sockets.socket(sessionIds[j]).json.send({'presenceNotification': {'uid': uid, 'event': presenceEvent}});
      }
    }
  }
  if (backendSettings.debug) {
    console.log('sendPresenceChangeNotification', uid, presenceEvent, onlineUsers);
  }
}

/**
 * Callback that wraps all requests and checks for a valid service key.
 */
var checkServiceKeyCallback = function (request, response, next) {
  if (checkServiceKey(request.header('NodejsServiceKey', ''))) {
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
  var requestBody = '';
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    requestBody += chunk;
  });
  request.on('end', function () {
    try {
      var toggle = JSON.parse(requestBody);
      backendSettings.debug = toggle.debug;
      response.send({debug: toggle.debug});
    }
    catch (exception) {
      console.log('toggleDebug: Invalid JSON "' + requestBody + '"', exception);
      response.send({error: 'Invalid JSON, error: ' + e.toString()});
    }
  });
}

/**
 * Http callback - read in a JSON message and publish it to interested clients.
 */
var publishMessage = function (request, response) {
  var sentCount = 0, requestBody = '';
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    requestBody += chunk;
  });
  request.on('end', function () {
    try {
      var message = JSON.parse(requestBody);
      if (backendSettings.debug) {
        console.log('publishMessage: message', message);
      }
    }
    catch (exception) {
      console.log('publishMessage: Invalid JSON "' + requestBody + '"',  exception);
      response.send({error: 'Invalid JSON, error: ' + exception.toString()});
      return;
    }
    if (message.broadcast) {
      if (backendSettings.debug) {
        console.log('Broadcasting message');
      }
      io.sockets.json.send(message);
      sentCount = io.sockets.sockets.length;
    }
    else {
      sentCount = publishMessageToChannel(message);
    }
    process.emit('message-published', message, sentCount);
    response.send({sent: sentCount});
  });
}

/**
 * Publish a message to clients subscribed to a channel.
 */
var publishMessageToChannel = function (message) {
  if (!message.hasOwnProperty('channel')) {
    console.log('publishMessageToChannel: An invalid message object was provided.');
    return 0;
  }
  if (!channels.hasOwnProperty(message.channel)) {
    console.log('publishMessageToChannel: The channel "' + message.channel + '" doesn\'t exist.');
    return 0;
  }

  var clientCount = 0;
  for (var sessionId in channels[message.channel].sessionIds) {
    if (publishMessageToClient(sessionId, message)) {
      clientCount++;
    }
  }
  if (backendSettings.debug) {
    console.log('Sent message to ' + clientCount + ' clients in channel "' + message.channel + '"');
  }
  return clientCount;
}

/**
 * Publish a message to clients subscribed to a channel.
 */
var publishMessageToContentChannel = function (request, response) {
  var sentCount = 0, requestBody = '';
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    requestBody += chunk;
  });
  request.on('end', function () {
    try {
      var message = JSON.parse(requestBody);
      if (backendSettings.debug) {
        console.log('publishMessageToContentChannel: message', message);
      }
    }
    catch (exception) {
      console.log('publishMessageToContentChannel: Invalid JSON "' + requestBody + '"', exception);
      response.send({error: 'Invalid JSON, error: ' + exception.toString()});
      return;
    }
    if (!message.hasOwnProperty('channel')) {
      console.log('publishMessageToContentChannel: An invalid message object was provided.');
      response.send({error: 'Invalid message'});
      return;
    }
    if (!tokenChannels.hasOwnProperty(message.channel)) {
      console.log('publishMessageToContentChannel: The channel "' + message.channel + '" doesn\'t exist.');
      response.send({error: 'Invalid message'});
      return;
    }

    for (var socketId in tokenChannels[message.channel].sockets) {
      publishMessageToClient(socketId, message);
    }
    response.send({sent: 'sent'});
  });
}

/**
 * Publish a message to a specific client.
 */
var publishMessageToClient = function (sessionId, message) {
  if (io.sockets.sockets[sessionId]) {
    io.sockets.socket(sessionId).json.send(message);
    if (backendSettings.debug) {
      console.log('Sent message to client ' + sessionId);
    }
    return true;
  }
  else {
    console.log('publishMessageToClient: Failed to find client ' + sessionId);
  }
};

/**
 * Sends a 404 message.
 */
var send404 = function (request, response) {
  response.send('Not Found.', 404);
};

/**
 * Kicks the given logged in user from the server.
 */
var kickUser = function (request, response) {
  if (request.params.uid) {
    // Delete the user from the authenticatedClients hash.
    for (var authToken in authenticatedClients) {
      if (authenticatedClients[authToken].uid == request.params.uid) {
        delete authenticatedClients[authToken];
      }
    }
    // Destroy any socket connections associated with this uid.
    for (var clientId in io.sockets.sockets) {
      if (io.sockets.sockets[clientId].uid == request.params.uid) {
        delete io.sockets.sockets[clientId];
        if (backendSettings.debug) {
          console.log('kickUser: deleted socket "' + clientId + '" for uid "' + request.params.uid + '"');
        }
        // Delete any channel entries for this clientId.
        for (var channel in channels) {
          delete channels[channel].sessionIds[clientId];
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
 * Logout the given user from the server.
 */
var logoutUser = function (request, response) {
  var authToken = request.params.authtoken || '';
  if (authToken) {
    console.log('Logging out http session', authToken);
    // Delete the user from the authenticatedClients hash.
    delete authenticatedClients[authToken];

    // Destroy any socket connections associated with this authToken.
    for (var clientId in io.sockets.sockets) {
      if (io.sockets.sockets[clientId].authToken == authToken) {
        delete io.sockets.sockets[clientId];
        // Delete any channel entries for this clientId.
        for (var channel in channels) {
          delete channels[channel].sessionIds[clientId];
        }
      }
    }
    response.send({'status': 'success'});
    return;
  }
  console.log('Failed to logout user, no authToken supplied');
  response.send({'status': 'failed', 'error': 'missing authToken'});
};

/**
 * Get the list of Node.js sessionIds for a given uid.
 */
var getNodejsSessionIdsFromUid = function (uid) {
  var sessionIds = [];
  for (var sessionId in io.sockets.sockets) {
    if (io.sockets.sockets[sessionId].uid == uid) {
      sessionIds.push(sessionId);
    }
  }
  if (backendSettings.debug) {
    console.log('getNodejsSessionIdsFromUid', {uid: uid, sessionIds: sessionIds});
  }
  return sessionIds;
}

/**
 * Get the list of Node.js sessionIds for a given authToken.
 */
var getNodejsSessionIdsFromAuthToken = function (authToken) {
  var sessionIds = [];
  for (var sessionId in io.sockets.sockets) {
    if (io.sockets.sockets[sessionId].authToken == authToken) {
      sessionIds.push(sessionId);
    }
  }
  if (backendSettings.debug) {
    console.log('getNodejsSessionIdsFromAuthToken', {authToken: authToken, sessionIds: sessionIds});
  }
  return sessionIds;
}

/**
 * Add a user to a channel.
 */
var addUserToChannel = function (request, response) {
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
    channels[channel] = channels[channel] || {'sessionIds': {}};
    var sessionIds = getNodejsSessionIdsFromUid(uid);
    if (sessionIds.length > 0) {
      for (var i in sessionIds) {
        channels[channel].sessionIds[sessionIds[i]] = sessionIds[i];
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
    for (var authToken in authenticatedClients) {
      if (authenticatedClients[authToken].uid == uid) {
        if (authenticatedClients[authToken].channels.indexOf(channel) == -1) {
          authenticatedClients[authToken].channels.push(channel);
          if (backendSettings.debug) {
            console.log("Added channel '" + channel + "' authenticatedClients");
          }
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
 * Add an authToken to a channel.
 */
var addAuthTokenToChannel = function (request, response) {
  var authToken = request.params.authToken || '';
  var channel = request.params.channel || '';
  if (!authToken || !channel) {
    console.log("Missing authToken or channel");
    response.send({'status': 'failed', 'error': 'Missing authToken or channel'});
    return;
  }

  if (!/^[a-z0-9_]+$/i.test(channel)) {
    console.log("Invalid channel: " + channel);
    response.send({'status': 'failed', 'error': 'Invalid channel name.'});
    return;
  }
  if (!authenticatedClients[authToken]) {
    console.log("Unknown authToken : " + authToken);
    response.send({'status': 'failed', 'error': 'Invalid authToken.'});
    return;
  }
  channels[channel] = channels[channel] || {'sessionIds': {}};
  var sessionIds = getNodejsSessionIdsFromAuthtoken(authToken);
  if (sessionIds.length > 0) {
    for (var i in sessionIds) {
      channels[channel].sessionIds[sessionIds[i]] = sessionIds[i];
    }
    if (backendSettings.debug) {
      console.log("Added sessionIds '" + sessionIds.join() + "' to channel '" + channel + "'");
    }
    response.send({'status': 'success'});
  }
  else {
    console.log("No active sessions for authToken: " + authToken);
    response.send({'status': 'failed', 'error': 'No active sessions for uid.'});
  }
  if (authenticatedClients[authToken].channels.indexOf(channel) == -1) {
    authenticatedClients[authToken].channels.push(channel);
    if (backendSettings.debug) {
      console.log("Added channel '" + channel + "' to authenticatedClients");
    }
  }
};

/**
 * Add a client (specified by session ID) to a channel.
 */
var addClientToChannel = function (sessionId, channel) {
  if (sessionId && channel) {
    if (!/^[0-9]+$/.test(sessionId) || !io.sockets.sockets.hasOwnProperty(sessionId)) {
      console.log("addClientToChannel: Invalid sessionId: " + sessionId);
    }
    else if (!/^[a-z0-9_]+$/i.test(channel)) {
      console.log("addClientToChannel: Invalid channel: " + channel);
    }
    else {
      channels[channel] = channels[channel] || {'sessionIds': {}};
      channels[channel].sessionIds[sessionId] = sessionId;
      if (backendSettings.debug) {
        console.log("Added channel '" + channel + "' to sessionId " + sessionId);
      }
      return true;
    }
  }
  else {
    console.log("addClientToChannel: Missing sessionId or channel name");
  }
  return false;
};

/**
 * Remove a user from a channel.
 */
var removeUserFromChannel = function (request, response) {
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
    if (channels[channel]) {
      var sessionIds = getNodejsSessionIdsFromUid(uid);
      for (var i in sessionIds) {
        if (channels[channel].sessionIds[sessionIds[i]]) {
          delete channels[channel].sessionIds[sessionIds[i]];
        }
      }
      for (var authToken in authenticatedClients) {
        if (authenticatedClients[authToken].uid == uid) {
          var index = authenticatedClients[authToken].channels.indexOf(channel);
          if (index != -1) {
            delete authenticatedClients[authToken].channels[index];
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
 * Remove an authToken from a channel.
 */
var removeAuthTokenFromChannel = function (request, response) {
  var authToken = request.params.authToken || '';
  var channel = request.params.channel || '';
  if (authToken && channel) {
    if (!authenticatedClients[authToken]) {
      console.log('Invalid authToken: ' + uid);
      response.send({'status': 'failed', 'error': 'Invalid authToken.'});
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(channel)) {
      console.log('Invalid channel: ' + channel);
      response.send({'status': 'failed', 'error': 'Invalid channel name.'});
      return;
    }
    if (channels[channel]) {
      var sessionIds = getNodejsSessionIdsFromAuthToken(authToken);
      for (var i in sessionIds) {
        if (channels[channel].sessionIds[sessionIds[i]]) {
          delete channels[channel].sessionIds[sessionIds[i]];
        }
      }
      if (authenticatedClients[authToken]) {
        var index = authenticatedClients[authToken].channels.indexOf(channel);
        if (index != -1) {
          delete authenticatedClients[authToken].channels[index];
        }
      }
      if (backendSettings.debug) {
        console.log("Successfully removed authToken '" + authToken + "' from channel '" + channel + "'.");
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
    console.log("Missing authToken or channel");
    response.send({'status': 'failed', 'error': 'Invalid data'});
  }
}

/**
 * Remove a client (specified by session ID) from a channel.
 */
var removeClientFromChannel = function (sessionId, channel) {
  if (sessionId && channel) {
    if (!/^[0-9]+$/.test(sessionId) || !io.sockets.sockets.hasOwnProperty(sessionId)) {
      console.log("removeClientFromChannel: Invalid sessionId: " + sessionId);
    }
    else if (!/^[a-z0-9_]+$/i.test(channel) || !channels.hasOwnProperty(channel)) {
      console.log("removeClientFromChannel: Invalid channel: " + channel);
    }
    else if (channels[channel].sessionIds[sessionId]) {
      delete channels[channels].sessionIds[sessionId];
      if (backendSettings.debug) {
        console.log("Removed sessionId '" + sessionId + "' from channel '" + channel + "'");
      }
      return true;
    }
  }
  else {
    console.log("removeClientFromChannel: Missing sessionId or channel name");
  }
  return false;
};

/**
 * Set the list of users a uid can see presence info about.
 */
var setUserPresenceList = function (uid, uids) {
  var uid = request.params.uid || '';
  var uidlist = request.params.uidlist.split(',') || [];
  if (uid && uidlist) {
    if (!/^\d+$/.test(uid)) {
      console.log("Invalid uid: " + uid);
      response.send({'status': 'failed', 'error': 'Invalid uid.'});
      return;
    }
    if (uidlist.length == 0) {
      console.log("Empty uidlist");
      response.send({'status': 'failed', 'error': 'Empty uid list.'});
      return;
    }
    for (var i in uidlist) {
      if (!/^\d+$/.test(uidlist[i])) {
        console.log("Invalid uid: " + uid);
        response.send({'status': 'failed', 'error': 'Invalid uid.'});
        return;
      }
    }
    onlineUsers[uid] = uidlist;
    response.send({'status': 'success'});
  }
  else {
    response.send({'status': 'failed', 'error': 'Invalid parameters.'});
  }
}

/**
 * Cleanup after a socket has disconnected.
 */
var cleanupSocket = function (socket) {
  if (backendSettings.debug) {
    console.log("Cleaning up after socket id", socket.id, 'uid', socket.uid);
  }
  for (var channel in channels) {
    delete channels[channel].sessionIds[socket.id];
  }
  var uid = socket.uid;
  if (uid != 0) {
    if (presenceTimeoutIds[uid]) {
      clearTimeout(presenceTimeoutIds[uid]);
    }
    presenceTimeoutIds[uid] = setTimeout(checkOnlineStatus, 2000, uid);
  }

  for (var tokenChannel in tokenChannels) {
    delete tokenChannels[tokenChannel].sockets[socket.id];
  }

  delete io.sockets.sockets[socket.id];
}

/**
 * Check for any open sockets for uid.
 */
var checkOnlineStatus = function (uid) {
  if (getNodejsSessionIdsFromUid(uid).length == 0) {
    if (backendSettings.debug) {
      console.log("Sending offline notification for", uid);
    }
    setUserOffline(uid);
  }
}

/**
 * Sends offline notification to sockets, the backend and cleans up our list.
 */
var setUserOffline = function (uid) {
  sendPresenceChangeNotification(uid, 'offline');
  delete onlineUsers[uid];
  sendMessageToBackend({uid: uid, messageType: 'userOffline'}, function (response) { });
}

/**
 * Set a content token.
 */
var setContentToken = function (request, response) {
  var requestBody = '';
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    requestBody += chunk;
  });
  request.on('end', function () {
    try {
      var message = JSON.parse(requestBody);
      if (backendSettings.debug) {
        console.log('setContentToken: message', message);
      }
    }
    catch (exception) {
      console.log('setContentToken: Invalid JSON "' + requestBody + '"',  exception);
      response.send({error: 'Invalid JSON, error: ' + exception.toString()});
      return;
    }
    tokenChannels[message.channel] = tokenChannels[message.channel] || {'tokens': {}, 'sockets': {}};
    tokenChannels[message.channel].tokens[message.token] = true;
    if (backendSettings.debug) {
      console.log('setContentToken', message.token, 'for channel', message.channel);
    }
    response.send({status: 'ok'});
  });
}

/**
 * Setup a io.sockets.sockets{}.connection with uid, channels etc.
 */
var setupClientConnection = function (sessionId, authData, contentTokens) {
  if (!io.sockets.sockets[sessionId]) {
    console.log("Client socket '" + sessionId + "' went away.");
    console.log(authData);
    return;
  }
  io.sockets.sockets[sessionId].authToken = authData.authToken;
  io.sockets.sockets[sessionId].uid = authData.uid;
  for (var i in authData.channels) {
    channels[authData.channels[i]] = channels[authData.channels[i]] || {'sessionIds': {}};
    channels[authData.channels[i]].sessionIds[sessionId] = sessionId;
  }
  if (authData.uid != 0) { 
    var sendPresenceChange = !onlineUsers[authData.uid];
    onlineUsers[authData.uid] = authData.presenceUids || [];
    if (sendPresenceChange) {
      sendPresenceChangeNotification(authData.uid, 'online');
    }
  }
 
  var clientToken = '';
  for (var tokenChannel in contentTokens) {
    tokenChannels[tokenChannel] = tokenChannels[tokenChannel] || {'tokens': {}, 'sockets': {}};

    clientToken = contentTokens[tokenChannel];
    if (tokenChannels[tokenChannel].tokens[clientToken]) {
      tokenChannels[tokenChannel].sockets[sessionId] = true;
      if (backendSettings.debug) {
        console.log('Added token', clientToken, 'for channel', tokenChannel, 'for socket', sessionId);
      }
      delete tokenChannels[tokenChannel].tokens[clientToken];
    }
  }

  process.emit('client-authenticated', sessionId, authData);

  if (backendSettings.debug) {
    console.log("Added channels for uid " + authData.uid + ': ' + authData.channels.toString());
    console.log('setupClientConnection', onlineUsers);
  }
};

var server;
if (backendSettings.scheme == 'https') {
  server = express.createServer({
    key: fs.readFileSync(backendSettings.key),
    cert: fs.readFileSync(backendSettings.cert)
  });
}
else {
  server = express.createServer();
}
server.all('/nodejs/*', checkServiceKeyCallback);
server.post(backendSettings.publishUrl, publishMessage);
server.get(backendSettings.kickUserUrl, kickUser);
server.get(backendSettings.logoutUserUrl, logoutUser);
server.get(backendSettings.addUserToChannelUrl, addUserToChannel);
server.get(backendSettings.removeUserFromChannelUrl, removeUserFromChannel);
server.get(backendSettings.setUserPresenceListUrl, setUserPresenceList);
server.get(backendSettings.toggleDebugUrl, toggleDebug);
server.post(backendSettings.contentTokenUrl, setContentToken);
server.post(backendSettings.publishMessageToContentChannelUrl, publishMessageToContentChannel);
server.get('*', send404);
server.listen(backendSettings.port, backendSettings.host);
console.log('Started ' + backendSettings.scheme + ' server.');

var io = socket_io.listen(server, {port: backendSettings.port, resource: backendSettings.resource});
io.configure(function () {
  io.set('transports', backendSettings.transports);
  io.set('log level', backendSettings.logLevel);
  if (backendSettings.jsEtag) {
    io.enable('browser client etag');
  }
  if (backendSettings.jsMinification) {
    io.enable('browser client minification');
  }
});

io.sockets.on('connection', function(socket) {
  process.emit('client-connection', socket.id);

  socket.on('authenticate', function(message) {
    if (backendSettings.debug) {
      console.log('Authenticating client with key "' + message.authToken + '"');
    }
    authenticateClient(socket, message);
  });

  socket.on('message', function(message) {
    // If the message is from an active client, then process it.
    if (io.sockets.sockets[socket.id] && message.hasOwnProperty('type')) {
      if (backendSettings.debug) {
        console.log('Received message from client ' + socket.id);
      }

      // If this message is destined for a channel, check that writing to 
      // channels from client sockets is allowed.
      if (message.hasOwnProperty('channel')) {
        if (backendSettings.clientsCanWriteToChannels || channelIsClientWritable(message.channel)) {
          process.emit('client-message', socket.id, message);
        }
        else if (backendSettings.debug) {
          console.log('Received unauthorised message from client: cannot write to channel ' + socket.id);
        }
      }

      // No channel, so this message is destined for one or more clients. Check
      // that this is allowed in the server configuration.
      if (backendSettings.clientsCanWriteToClients) {
        process.emit('client-message', socket.id, message);
      }
      else if (backendSettings.debug) {
        console.log('Received unauthorised message from client: cannot write to client ' + socket.id);
      }
      return;
    }
  });

  socket.on('disconnect', function () {
    process.emit('client-disconnect', socket.id);
    cleanupSocket(socket);
  });
})
.on('error', function(exception) {
  console.log('Socket error [' + exception + ']');
});

/**
 * Invokes the specified function on all registered server extensions.
 */
var invokeExtensions = function (hook) {
  var args = arguments.length ? Array.prototype.slice.call(arguments, 1) : [];
  for (var i in extensions) {
    if (extensions[i].hasOwnProperty(hook) && extensions[i][hook].apply) {
      extensions[i][hook].apply(this, args);
    }
  }
}

/**
 * Define a configuration object to pass to all server extensions at
 * initialization. The extensions do not have access to this namespace,
 * so we provide them with references.
 */
var extensionsConfig = {
  'publishMessageToChannel': publishMessageToChannel,
  'publishMessageToClient': publishMessageToClient,
  'addClientToChannel': addClientToChannel,
  'backendSettings': backendSettings,
  'channels': channels,
  'io': io,
  'tokenChannels': tokenChannels,
  'sendMessageToBackend': sendMessageToBackend
};
invokeExtensions('setup', extensionsConfig);

// vi:ai:expandtab:sw=2 ts=2

