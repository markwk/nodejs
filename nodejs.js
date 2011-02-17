
(function ($) {

Drupal.Nodejs = Drupal.Nodejs || {'callbacks': {}, 'socket': false};

Drupal.Nodejs.runCallbacks = function (message) {
	$.each(Drupal.Nodejs.callbacks, function () {
		if ($.isFunction(this.callback)) {
			this.callback(message);
		}
	});
};

Drupal.Nodejs.callbacks.nodejsUserChannel = {
  callback: function (message) {
    message = JSON.parse(message);
    alert(message.channel);
  }
};

Drupal.behaviors.nodejs = {
  attach: function (context, settings) {
		if (!Drupal.Nodejs.socket) {
      Drupal.Nodejs.socket = new io.Socket(Drupal.settings.nodejs.host, {port: Drupal.settings.nodejs.port, resource: Drupal.settings.nodejs.resource});
      Drupal.Nodejs.socket.connect();
      var jsonMessage = JSON.stringify({
        authkey: Drupal.settings.nodejs.authkey,
        uid: Drupal.settings.nodejs.uid,
        channels: Drupal.settings.nodejs.channels
      });
      Drupal.Nodejs.socket.send(jsonMessage);
      Drupal.Nodejs.socket.on('message', function(newMessage) {
        alert(newMessage);
        Drupal.Nodejs.runCallbacks(newMessage);
      });
    }
  }
};

})(jQuery);

