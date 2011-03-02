
(function ($) {

Drupal.Nodejs.callbacks.nodejsNotify = {
  callback: function (message) {
    switch (message.channel) {
      case 'nodejs_notify':
        $.jGrowl(message.data.body, {header: message.data.subject});
      break;
    }
  }
};

Drupal.Nodejs.userCallbacks.nodejsNotify = {
  callback: function (message) {
    $.jGrowl(message.data.body, {header: message.data.subject});
  }
};

})(jQuery);

