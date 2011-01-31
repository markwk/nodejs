
(function ($) {

Drupal.Nodejs = Drupal.Nodejs || {'callbacks': {}};

Drupal.Nodejs.runCallbacks = function (message) {
	$.each(Drupal.Nodejs.callbacks, function () {
		if ($.isFunction(this.callback)) {
			this.callback(message);
		}
	});
};

Drupal.behaviors.nodejs = {
  attach: function (context, settings) {
		var socket = new io.Socket(Drupal.settings.nodejs.host, {port: Drupal.settings.nodejs.port, resource: Drupal.settings.nodejs.resource});
		socket.connect();
		socket.send('authkey=' + Drupal.settings.nodejs.authkey);
		socket.on('message', function(message) {
      Drupal.Nodejs.runCallbacks(message);
		});
  }
};

})(jQuery);

