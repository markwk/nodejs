
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

  attach: function (context) {
    if (!Drupal.Nodejs.socket) {
      Drupal.Nodejs.socket = new io.Socket(
        Drupal.settings.nodejs.host,
        {secure: Drupal.settings.nodejs.secure, port: Drupal.settings.nodejs.port, resource: Drupal.settings.nodejs.resource}
      );
      Drupal.Nodejs.socket.connect();
      var jsonMessage = JSON.stringify({
        authkey: Drupal.settings.nodejs.authkey
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

