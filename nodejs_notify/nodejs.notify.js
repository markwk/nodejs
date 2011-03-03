
(function ($) {

Drupal.Nodejs.callbacks.nodejsNotify = {
  callback: function (message) {
    $.jGrowl(message.data.body, {header: message.data.subject});
  }
};

})(jQuery);

