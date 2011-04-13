
(function ($) {

Drupal.Nodejs = Drupal.Nodejs || {'callbacks': {}, 'socket': false};

Drupal.Nodejs.runCallbacks = function (message) {
  if (message.callback && $.isFunction(Drupal.Nodejs.callbacks[message.callback].callback)) {
    try {
      Drupal.Nodejs.callbacks[message.callback].callback(message);
    }
    catch (exception) {}
  }
  else {
    $.each(Drupal.Nodejs.callbacks, function () {
      if ($.isFunction(this.callback)) {
        try {
          this.callback(message);
        }
        catch (exception) {}
      }
    });
  }
};

Drupal.behaviors.nodejs = {
  attach: function (context, settings) {
    if (!Drupal.Nodejs.socket) {
      window.WEB_SOCKET_SWF_LOCATION = Drupal.settings.nodejs.websocketSwfLocation;
      Drupal.Nodejs.socket = new io.Socket(
        Drupal.settings.nodejs.host,
        {secure: Drupal.settings.nodejs.secure, port: Drupal.settings.nodejs.port, resource: Drupal.settings.nodejs.resource}
      );
      Drupal.Nodejs.socket.on('message', function(newMessage) {
        Drupal.Nodejs.runCallbacks(newMessage);
      });
      Drupal.Nodejs.socket.connect();
      var jsonMessage = {
        type: 'authenticate',
        authkey: Drupal.settings.nodejs.authkey
      };
      Drupal.Nodejs.socket.send(jsonMessage);
    }
  }
};

})(jQuery);

