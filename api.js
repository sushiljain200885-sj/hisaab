/* ============================================================
   Hisaab — Google Apps Script (Sheet) se baat karne ka client
   ------------------------------------------------------------
   Apps Script ka doPost JSON leta hai. Content-Type text/plain
   isliye rakha hai taaki browser CORS preflight na bheje.
   ============================================================ */
(function (root) {
  'use strict';

  var API = {
    url: '',
    token: '',

    setConfig: function (url, token) {
      API.url = String(url || '').trim();
      API.token = token || '';
    },

    isConfigured: function () {
      return /^https?:\/\//.test(API.url);
    },

    call: function (action, payload) {
      if (!API.isConfigured()) return Promise.reject(new Error('Sheet URL set nahi hai'));

      var body = { action: action, token: API.token };
      if (payload) Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });

      return fetch(API.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      }).then(function (res) {
        if (!res.ok) throw new Error('Sheet ne HTTP ' + res.status + ' diya');
        return res.text();
      }).then(function (txt) {
        var data;
        try {
          data = JSON.parse(txt);
        } catch (e) {
          throw new Error('Sheet se galat jawab aaya (URL sahi hai?)');
        }
        if (data && data.token) API.token = data.token;
        if (data && data.error === 'locked') {
          var errLock = new Error(data.message || 'Thodi der baad try karein');
          errLock.code = 'locked';
          throw errLock;
        }
        if (data && (data.error === 'unauthorised' || data.ok === false && /password/i.test(String(data.message || data.error)))) {
          var err = new Error(data.message || 'Password galat hai');
          err.code = 'auth';
          throw err;
        }
        if (data && data.ok === false) {
          var err2 = new Error(data.message || data.error || 'Sheet ne error diya');
          err2.code = data.error || 'error';
          throw err2;
        }
        return data;
      });
    },

    auth: function (password) {
      return API.call('auth', { password: password || '' });
    },

    list: function () {
      return API.call('list');
    },

    add: function (entry) {
      return API.call('add', { entry: entry });
    },

    update: function (entry) {
      return API.call('update', { entry: entry });
    },

    remove: function (id) {
      return API.call('delete', { id: id });
    },

    loans: function () {
      return API.call('loanList');
    },

    addLoan: function (loan) {
      return API.call('loanAdd', { loan: loan });
    },

    updateLoan: function (loan) {
      return API.call('loanUpdate', { loan: loan });
    },

    removeLoan: function (id) {
      return API.call('loanDelete', { id: id });
    },

    ping: function () {
      return API.call('ping');
    }
  };

  root.HisaabAPI = API;
})(window);
