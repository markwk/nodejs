(function ($) {

  var element_settings = {};
  element_settings.event = 'fake_event';
  element_settings.url = '';

  var element = $('');
  Drupal.nodejs_ajax = new Drupal.ajax('nodejs_ajax', element, element_settings);


  Drupal.Nodejs.callbacks.nodejsNodeAjax = {
    callback: function (message) {
      switch (message.channel) {
        case 'nodejs_ajax_broadcast':
          var response = message.commands;
          for (var i in response) {
            if (response[i]['command'] && Drupal.nodejs_ajax.commands[response[i]['command']]) {
              Drupal.nodejs_ajax.commands[response[i]['command']](Drupal.nodejs_ajax, response[i], 200);
            }
          }
          break;
      }
    }
  };

  Drupal.Nodejs.userCallbacks.nodejsNodeAjax = {
    callback: function (message) {
      var response = message.commands;
      for (var i in response) {
        if (response[i]['command'] && Drupal.nodejs_ajax.commands[response[i]['command']]) {
          Drupal.nodejs_ajax.commands[response[i]['command']](Drupal.nodejs_ajax, response[i], 200);
        }
      }
    }
  };

})(jQuery);


