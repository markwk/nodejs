
(function ($) {

Drupal.Nodejs = Drupal.Nodejs || {'callbacks': {}, 'socket': false};

Drupal.Nodejs.runCallbacks = function (message) {
  if (message.callback && $.isFunction(Drupal.Nodejs.callbacks[message.callback].callback)) {
    Drupal.Nodejs.callbacks[message.callback].callback(message);
  }
  else {
    $.each(Drupal.Nodejs.callbacks, function () {
      if ($.isFunction(this.callback)) {
        this.callback(message);
      }
    });
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
        Drupal.Nodejs.runCallbacks(newMessage);
      });
    }
  }
};

})(jQuery);

