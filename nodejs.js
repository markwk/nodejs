
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

Drupal.Nodejs.runSetupHandlers = function (type, error) {
  $.each(Drupal.Nodejs.connectionSetupHandler, function () {
    if ($.isFunction(this[type])) {
      try {
        if (typeof(error) == 'undefined') {
          this[type]();
        }
        else {
          this[type](error);
        }
      }
      catch (exception) {}
    }
  });
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

      try {
        Drupal.Nodejs.socket.connect();
        Drupal.Nodejs.runSetupHandlers('connectionSuccess');
      }
      catch (exception) {
        Drupal.Nodejs.socket = false;
        Drupal.Nodejs.runSetupHandlers('connectionFailure', exception);
        return;
      }

      try {
        var authMessage = {
          type: 'authenticate',
          authkey: Drupal.settings.nodejs.authkey
        };
        Drupal.Nodejs.socket.send(authMessage);
        Drupal.Nodejs.runSetupHandlers('authSuccess');
      }
      catch (exception) {
        Drupal.Nodejs.socket = false;
        Drupal.Nodejs.runSetupHandlers('authFailure', exception);
        return;
      }
    }
  }
};

})(jQuery);

