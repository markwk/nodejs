(function ($) {

Drupal.behaviors.batch = {
  attach: function (context, settings) {
		var socket = new io.Socket(Drupal.settings.nodejs.host, {port: Drupal.settings.nodejs.port, resource: Drupal.settings.nodejs.resource});
		socket.connect();
		socket.send('authkey=' + Drupal.settings.nodejs.authkey);
		socket.on('message', function(obj) {
			if (obj.message) {
				$('#nodejs-wrapper').append('<p>' + obj.message + '</p>');
			}
		});
  }
};

})(jQuery);

