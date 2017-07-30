(function(){

  var base_url = "https://chat.dev";
  var config = {
    admin_name: "Aaron Parecki",
    status: base_url+"/chat/active",
    login: base_url+"/chat/login",
    send: base_url+"/chat/send",
    listen: base_url+"/streaming/sub",
    quit: base_url+"/chat/quit",
    resumed: base_url+"/chat/resumed",
    placeholder: "Type a message, press enter to send...",
    welcome_message: "Hi visitor, tell me, who are you and what can I do for you?"
  };

  function ready(fn) {
    if (document.readyState != 'loading'){
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function post(url, params, fn, err) {
    var data = "";
    for(var k in params) {
      data += k+"="+encodeURIComponent(params[k])+"&";
    }

    var request = new XMLHttpRequest();
    request.open('POST', url, true);
    request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');

    request.onload = function() {
      if(request.status >= 200 && request.status < 400) {
        // Success!
        var data = JSON.parse(request.responseText);
        fn(data);
      } else {
        // We reached our target server, but it returned an error
        if(err) {
          err(request);
        }
      }
    }

    if(err) {
      request.onerror = err;
    }

    request.send(data);
  }

  function get(url, fn, err) {
    var request = new XMLHttpRequest();
    request.open('GET', url, true);

    request.onload = function() {
      if(request.status >= 200 && request.status < 400) {
        // Success!
        var data = JSON.parse(request.responseText);
        fn(data);
      } else {
        // We reached our target server, but it returned an error
        if(err) {
          err(request);
        }
      }
    };

    if(err) {
      request.onerror = err;
    }

    request.send();
  }

  ready(function(){
    get(config.status, function(status){
      if(status.active) {
        var div = document.createElement('div');
        div.classList.add("chat-button");
        div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" viewBox="0 0 100 125"><g transform="translate(0,-952.36218)"><path style="color:#FFFFFF;enable-background:accumulate;" d="m 50.000002,963.36217 c -22.6486,0 -41,14.9704 -41,33.43753 0,10.7045 6.4027,19.4424 16,25.5625 l -8,19 22,-12 c 2.9907,0.5659 7.7979,0.8438 11,0.8438 22.6486,0 40.999996,-14.9392 40.999996,-33.4063 0,-18.46713 -18.351396,-33.43753 -40.999996,-33.43753 z m -23,28.00003 c 2.7614,0 5,2.2386 5,5 0,2.7614 -2.2386,5 -5,5 -2.7614,0 -5,-2.2386 -5,-5 0,-2.7614 2.2386,-5 5,-5 z m 23,0 c 2.7614,0 5,2.2386 5,5 0,2.7614 -2.2386,5 -5,5 -2.7614,0 -5,-2.2386 -5,-5 0,-2.7614 2.2386,-5 5,-5 z m 23,0 c 2.761396,0 4.999996,2.2386 4.999996,5 0,2.7614 -2.2386,5 -4.999996,5 -2.7614,0 -5,-2.2386 -5,-5 0,-2.7614 2.2386,-5 5,-5 z" fill="#FFFFFF" stroke="none" marker="none" visibility="visible" display="inline" overflow="visible"/></g></svg>';
        div.addEventListener('click', function(){
          showChatWidget();
          hideChatButton();
        });
        document.body.appendChild(div);
        if(localStorage.getItem("chat-history")) {
          showChatWidget();
          hideChatButton();
          sendResumed();
        }
      }
    });

    window.addEventListener("beforeunload", function(evt){
      if(currentChatToken()){
        sendQuit();
      }
    });
  });

  function listenForMessages() {
    var stream = new EventSource(config.listen+"?id="+currentChatChannel());
    stream.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      appendRemoteMessage(msg.data.nick, msg.data.text);
      addMessageToHistory("remote", msg.data.text);
    }
  }

  function currentChatToken() {
    return localStorage.getItem("chat-token");
  }

  function currentChatChannel() {
    return localStorage.getItem("chat-channel");
  }

  function loadMessageHistory() {
    var history = JSON.parse(localStorage.getItem("chat-history"));
    if(history) {
      var li;
      for(var i in history) {
        var msg = history[i];
        if(msg.type == "my") {
          li = appendMyMessage(msg.text, false);
          li.classList.remove("pending");
        } else {
          li = appendRemoteMessage(null, msg.text, false);
        }
      }
      li.scrollIntoView();
    }
  }

  function addMessageToHistory(type, text) {
    var history = JSON.parse(localStorage.getItem("chat-history"));
    if(!history) {
      history = [];
    }
    if(history.length > 5) {
      history.shift();
    }
    history.push({
      type: type,
      text: text
    });
    localStorage.setItem("chat-history", JSON.stringify(history));
    return history;
  }

  function hideChatButton() {
    document.querySelector('.chat-button').classList.add("hidden");
  }

  function showChatButton() {
    document.querySelector('.chat-button').classList.remove("hidden");
  }

  function hideChatWidget() {
    document.querySelector('.chat-widget').classList.add("hidden");
    document.querySelector('.chat-widget').innerHTML = '';
  }

  function showChatWidget() {
    var div = document.createElement('div');
    div.classList.add("chat-widget");
    div.innerHTML = '' +
      '<div class="chat-widget-header"><div>' +
        '<span class="left">' +
          '<span id="chat-widget-online-status" class="online"></span> ' +
          config.admin_name +
        '</span>' +
        '<span class="right">' +
          '<a href="#" class="close">&times;</a>' +
        '</span>' +
      '</div></div>' +
      '<div class="chat-widget-messages">' +
        '<ul></ul>' +
      '</div>' +
      '<div class="chat-widget-input">' +
        '<textarea name="chat-widget-message" disabled placeholder="'+config.placeholder+'"></textarea>'
      '</div>'
      ;
    document.body.appendChild(div);
    document.querySelector(".chat-widget-input textarea").addEventListener("keydown", function(evt){
      if(evt.keyCode == 13) {
        sendCurrentMessage();
        evt.preventDefault();
      }
    });
    document.querySelector(".chat-widget-input textarea").focus();

    document.querySelector(".chat-widget .close").addEventListener("click", function(evt){
      evt.preventDefault();
      closeChatWidget();
    });

    // Request a chat session token or use the one that already exists
    if(currentChatToken()) {
      loadMessageHistory();
      listenForMessages(currentChatChannel());
    } else if (config.welcome_message) {
      // No chat session yet? Send a welcome message
      setTimeout(function(){
        appendRemoteMessage(null, config.welcome_message);
        addMessageToHistory("remote", config.welcome_message);
      }, 900);
    }

    document.querySelector(".chat-widget-input textarea").disabled = false;
  }

  function closeChatWidget() {
    sendQuit();
    localStorage.removeItem("chat-token");
    localStorage.removeItem("chat-channel");
    localStorage.removeItem("chat-history");
    hideChatWidget();
    showChatButton();
  }

  function getChatToken(callback) {
    if(currentChatToken()) {
      callback();
    } else {
      get(config.login, function(response){
        if(response.token) {
          localStorage.setItem("chat-token", response.token);
          localStorage.setItem("chat-channel", response.channel);
          document.querySelector(".chat-widget-input textarea").disabled = false;
          listenForMessages(response.channel);
          callback();
        }
      });
    }
  }

  function sendCurrentMessage() {
    getChatToken(function(){
      var input = document.querySelector(".chat-widget-input textarea");
      var text = input.value;
      input.value = "";

      var li = appendMyMessage(text);

      post(config.send, {
        token: currentChatToken(),
        text: text
      }, function(response) {
        li.classList.remove("pending");
        addMessageToHistory("my", text);
      }, function(err) {
        li.classList.add("error");
      });
    });
    return false;
  }

  function sendQuit() {
    post(config.quit, {
      token: currentChatToken()
    }, function(response){

    });
  }

  function sendResumed() {
    post(config.resumed, {
      token: currentChatToken()
    }, function(response){

    });
  }

  function appendMyMessage(text, scroll=true) {
    var li = document.createElement("li");
    li.classList.add("mine","pending");
      var div = document.createElement("div");
        var span = document.createElement("span");
        span.innerText = text;
      div.appendChild(span);
    li.appendChild(div);
    document.querySelector(".chat-widget-messages ul").appendChild(li);
    if(scroll) {
      // TODO: scrolls the rest of the page too in safari!
      li.scrollIntoView();
    }
    return li;
  }

  function appendRemoteMessage(username, text, scroll=true) {
    var li = document.createElement("li");
    li.classList.add("remote");
      var div = document.createElement("div");
        var span = document.createElement("span");
        text = autolink(escapeHTML(text));
        span.innerHTML = text;
      div.appendChild(span);
    li.appendChild(div);
    document.querySelector(".chat-widget-messages ul").appendChild(li);
    if(scroll) {
      // TODO: scrolls the rest of the page too in safari!
      li.scrollIntoView();
    }
    return li;
  }

  function escapeHTML(str) {
    var entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return String(str).replace(/[&<>"'`=\/]/g, function(s) {
      return entityMap[s];
    });
  }

  function autolink(str) {
    return String(str).replace(/([^@ ]+@[^ ]+\.[^ ]+)/g, '<a href="mailto:$1">$1</a>');
  }

})();
