
(function ($) {

Drupal.Nodejs = Drupal.Nodejs || {'callbacks': {}, 'userCallbacks': {}, 'socket': false};

Drupal.Nodejs.runCallbacks = function (message) {
	$.each(Drupal.Nodejs.callbacks, function () {
		if ($.isFunction(this.callback)) {
			this.callback(message);
		}
	});
};

Drupal.Nodejs.runUserCallbacks = function (message) {
	$.each(Drupal.Nodejs.userCallbacks, function () {
		if ($.isFunction(this.callback)) {
			this.callback(message);
		}
	});
};

Drupal.Nodejs.userCallbacks.privateMsg = {
  callback: function (message) {
    $('#block-privatemsg-privatemsg-new').append('<p>New message: ' + message.data.subject + '</p>');
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
        newMessage = JSON.parse(newMessage);
        if (/^user_(\d+)$/.test(newMessage.channel)) {
          Drupal.Nodejs.runUserCallbacks(newMessage);
        }
        else {
          Drupal.Nodejs.runCallbacks(newMessage);
        }
      });
    }
  }
};

})(jQuery);

