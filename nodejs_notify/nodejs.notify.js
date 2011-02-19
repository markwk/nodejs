
(function ($) {

Drupal.Nodejs.callbacks.nodejsNotify = {
  callback: function (message) {
    switch (message.channel) {
      case 'nodejs_notify':
        $.jGrowl(message.data.body);
      break;
    }
  }
};

})(jQuery);

