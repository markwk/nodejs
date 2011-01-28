/**
 * Don't use this code, its nasty, nasty proof-of-concept stuff only.
 * It will eat your lunch and kill your kittens.
 */
var http = require('http'),
		url = require('url'),
    fs = require('fs'),
		io = require('/home/justin/code/Socket.IO-node/lib/socket.io'),
		sys = require(process.binding('natives').util ? 'util' : 'sys'),
    server;

server = http.createServer(function (request, response) {
  var path = url.parse(request.url).pathname;
  switch (path) {
    case '/publish':
			request.setEncoding('utf8');
			request.on('data', function (chunk) {
        for (var id in clients) {
					console.log('got a call to publish something, sending "' + chunk + '" to client "' + id + '"');
					clients[id].send({message: chunk});
        }
			});
			response.writeHead(200, {'Content-Type': 'text/plain'});
			response.writeHead(200, {'X-Message-Published': 'mkay'});
			response.end();
      break;
  }
});

server.listen(8080);

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

var socket = io.listen(server, {port: 8080, resource: '/node.js/realtime'});
var clients = [];

socket.on('connection', function(client) {
  client.on('message', function(message) {
    var match = null;
    if (match = message.match(/^authkey=(.*)$/)) {
      var options = {port: 80, host: 'drupal7.clean', path: '/nodejs/auth/' + match[1]};
      http.get(options, function (response) {
				console.log('client auth key' + match[1]);
        response.setEncoding('utf8');
				response.on('data', function (chunk) {
          var auth_data = JSON.parse(chunk);
          if (auth_data.is_valid) {
            console.log("got valid login for uid " + auth_data.uid);
						clients[client.sessionId] = client;
					}
					else {
            console.log("got invalid login for uid " + auth_data.uid);
						delete clients[client.sessionId];
					}
				});
			}).on('error', function(e) {
				console.log("Got error: " + e.message);
			});
    }
		else {
			console.log('connection from client ' + client.sessionId);
			var msg = {message: client.sessionId + ': ' + message};
			client.broadcast(msg);
			client.send(msg);
		}
  });
  client.on('disconnect', function() {
    console.log('disconnect from client ' + client.sessionId);
		delete clients[client.sessionId];
  });
});

