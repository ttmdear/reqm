(function (scope, factory) {
    if (typeof define === "function" && define.amd) {
        define(['taskm'], function(taskm){
            return factory(taskm);
        });

    } else if (typeof module === "object" && module.exports) {
        module.exports = function() {
            return factory();
        };

    } else {
        scope.reqm = factory(scope.taskm);
    }
}(this, function (taskm) {
    "use strict";

    var s =
    {
        binds : {},
        successStatus : [200, 201],
        timeout : null,
        // default Headers
        headers :
        {
            "Content-Type" : "application/x-www-form-urlencoded",
        },
        // request body parser
        requestPreparator :
        {
            "application/x-www-form-urlencoded" : function(object){
                var str = [];

                for(var p in object){
                    str.push(encodeURIComponent(p) + "=" + encodeURIComponent(object[p]));
                }

                return str.join("&");
            },
            "application/json" : function(data){
                return JSON.stringify(data);
            },
        },
        events : null,
        // reposen parser
        responseParser :
        {
            "text/html" : "plain/text",
            "plain/text" : function(raw, parameters){
                return raw;
            },
            "application/json" : function(raw, parameters){
                if (raw === "") {
                    // empty respo is empty object
                    return {};
                }

                var data;

                try{
                    data = JSON.parse(raw);
                }catch(e){
                    return false;
                }

                return data;
            },
        },
        encodeData : function(contentType, object, inParameters)
        {
            var process = s.parseContentType(contentType);

            contentType = process.contentType;
            var parameters = process.parameters;

            if (inParameters !== undefined) {
                parameters = inParameters;
            }

            if (s.requestPreparator[contentType] === undefined) {
                throw("There is no requestPreparator for "+contentType);
            }

            var requestPreparator = s.requestPreparator[contentType];

            if (s.isString(requestPreparator)) {
                return s.encodeData(requestPreparator, object, parameters);
            }

            if (!s.isFunction(requestPreparator)) {
                throw(contentType + " requestPreparator must be function.");
            }

            return requestPreparator.call(window, object, parameters);
        },
        decodeData : function(contentType, raw, inParameters)
        {
            var process = s.parseContentType(contentType);

            contentType = process.contentType;
            var parameters = process.parameters;

            if (inParameters !== undefined) {
                parameters = inParameters;
            }

            if (s.responseParser[contentType] === undefined) {
                throw("There is no responseParser for "+contentType);
            }

            var responseParser = s.responseParser[contentType];

            if (s.isString(responseParser)) {
                return s.decodeData(responseParser, raw, parameters);
            }

            if (!s.isFunction(responseParser)) {
                throw(contentType + " responseParser must be function.");
            }

            return responseParser.call(window, raw, parameters);
        },
        parseContentType : function(contentType)
        {
            var splited = contentType.split(";");
            contentType = splited.shift();

            var parameters = {};

            s.each(splited, function(i, parameter){
                parameter = parameter.trim();
                parameter = parameter.split("=");

                parameters[parameter[0]] = parameter[1];
            });

            return {
                contentType : contentType,
                parameters : parameters
            };
        },
        each : function(object, callback)
        {
            for(var i in object){
                if (!object.hasOwnProperty(i)) {
                    continue;
                }

                var op = callback.call(object[i], i, object[i]);

                if (op === false) {
                    break;
                }
            }
        },
        needFunction : function(toCheck, msg)
        {
            if (!s.isFunction(toCheck)) {
                throw(msg);
            }

            return;
        },
        isNull : function(toCheck)
        {
            if (toCheck === null) {
                return true;
            }

            return false;
        },
        isFunction : function(toCheck)
        {
            if (typeof toCheck === "function") {
                return true;
            }

            return false;
        },
        isString : function(toCheck)
        {
            if (typeof toCheck === "string") {
                return true;
            }

            return false;
        },
        uuid : function()
        {
            var d = new Date().getTime();

            if(window.performance && typeof window.performance.now === "function"){
                d += performance.now();
            }

            var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
                var r = (d + Math.random()*16)%16 | 0;
                d = Math.floor(d/16);
                return (c=="x" ? r : (r&0x3|0x8)).toString(16);
            });

            return uuid;
        },
    };

    function Request(task)
    {
        this.p = {
            // zadanie bazowe
            task : task,
            // adres
            url : null,
            // metoda
            method : null,
            // bindowanie parametrow
            binds : {},
            // dane
            data : {},
            // opis zadania
            description : null,
            // naglowki
            headers : {
                // standardowy typ contentu
                'Content-Type' : 'application/json'
            },
            timeout : null,
            params : {},
            error : function(error){
                throw("Uncatch error"+error);
            },
            control : function(data, next){
                next();
            }
            // events : new Events(t),
        };

        if (Request.inited === undefined) {
            Request.inited = true;

            Request.prototype.request = function(creator)
            {
                // tworze nowe zadanie zalezne
                var task = this.p.task.task();

                // tworze request i lacze go z podanym zadaniem
                // request juz bedzie wiedzial jak sie wpiac w to zadanie
                var request = new Request(task);

                if (s.isFunction(creator)) {
                    request.creator(creator);
                }

                return this;
            }

            Request.prototype.then = function(then)
            {
                var t = this;

                this.p.task.error(function(data, repair, resolve){
                    t.p.error.call(t, data, repair, resolve);
                });

                this.p.task.then(function(data){

                });

                return this;
            }

            Request.prototype.error = function(error)
            {
                // ustawia obsluge bledu dla zadania
                this.p.error = error;
                return this;
            }

            Request.prototype.creator = function(creator)
            {
                creator.call(this);
                return this;
            }

            Request.prototype.getContentType = function()
            {
                return this.p.headers["Content-Type"];
            }

            Request.prototype.setName = function(name)
            {
                this.p.task.setName(name);
                return this;
            }

            Request.prototype.getName = function()
            {
                return this.p.task.getName();
            }

            Request.prototype.setUrl = function(url)
            {
                this.p.url = url;
                return this;
            }

            Request.prototype.getUrl = function(resolved, withParams)
            {
                if (this.p.url === null) {
                    throw("The request do not have defined url.");
                }

                var tmp = this.p.url;

                resolved = resolved === undefined ? true : resolved;
                withParams = withParams === undefined ? true : withParams;

                if (resolved) {
                    for(var i in this.p.binds){
                        tmp = tmp.replace("{"+i+"}", this.p.binds[i]);
                    }
                }

                if (withParams) {
                    var params = "?";
                    var sep = "";

                    s.each(this.p.params, function(param, value){
                        params += sep + param + "=" + encodeURIComponent(value);
                        sep = "&";
                    });

                    if (params !== "?") {
                        tmp += params;
                    }
                }

                return tmp;
            }

            Request.prototype.setTimeout = function(timeout)
            {
                this.p.task.setTimeout(timeout);
                return this;
            }

            Request.prototype.setRequestTimeout = function(timeout)
            {
                this.p.timeout = timeout;
                return this;
            }

            Request.prototype.setMethod = function(method)
            {
                this.p.method = method;
                return this;
            }

            Request.prototype.setHeader = function(header, value)
            {
                this.p.headers[header] = value;
                return this;
            }

            Request.prototype.setData = function(name, value)
            {
                this.p.task.set(name, value);
                return this;
            }

            Request.prototype.setParam = function(name, value)
            {
                if (s.isString(name)) {
                    this.p.params[name] = value;
                }else{
                    s.each(name, function(name, value){
                        this.p.params[name] = value;
                    });
                }

                return this;
            }

            Request.prototype.bind = function(name, value)
            {
                this.p.binds[name] = value;
                return this;
            }

            Request.prototype.execute = function(complete)
            {
                var t = this;

                // sprawdzam jaki jest zdefiniowany contentType dla zadania
                var contentType = this.getContentType();

                // koduje dane zgodnie z typem danych
                var data = s.encodeData(contentType, this.p.data);

                if (!s.isString(data)) {
                    // metoda kodujaca zwrocila false co oznacza ze nie udalo
                    // sie zakodowac danych
                    throw(contentType + " requestPreparator not return string, i can't send request.");
                }

                // wszystko jest ok, tworze obiekt XMLHttpRequest
                var xhr = new XMLHttpRequest();

                // xhr.onloadstart = function(){

                // }

                var ended = false;
                var end = function(isError, error)
                {
                    if (ended) {
                        return;
                    }

                    ended = true;

                    var data = {};
                    var status = {};

                    if (isError) {
                        // jesli jest blad to ustawiam status
                        status = error;
                    }else{
                        // niema bledu wykonania, ale moze byc jeszcze blad ze
                        // zlym statsem
                        status = xhr.status;

                        var contentType = xhr.getResponseHeader("Content-Type");
                        if (s.isNull(contentType)) {
                            contentType = "plain/text";
                        }

                        data = s.decodeData(contentType, xhr.responseText);

                        if (data === false) {
                            status = "unread";
                            data = {};
                        }
                    }

                    var response = new Response(xhr, this, data, status);
                    complete.call(t, response);
                }

                // podpinam sie pod opowiednie zdarzenia
                xhr.onload = function ()
                {
                    end(false);
                };

                xhr.onloadend = function()
                {
                    end(false);
                }

                xhr.ontimeout = function()
                {
                    end(true, "timeout");
                }

                xhr.onabort = function()
                {
                    end(true, "abort");
                }

                xhr.onerror = function()
                {
                    end(true, "error");
                }

                xhr.open(this.p.method, t.getUrl(), true);

                // wczytuje zdefiniowane naglowki
                s.each(this.p.headers, function(header, value){
                    xhr.setRequestHeader(header, value);
                });

                var timeoutInit = function()
                {
                    if (!s.isNull(p.timeout)) {
                        setTimeout(function() {
                            end(true, "timeout");
                        }, p.timeout);
                    }
                }

                xhr.send(data);
                timeoutInit();
            }
        }

        var t = this;
        this.p.task.exec(function(resolve, reject){
            t.p.control.call(t, this.get(), function(){
                t.execute(function(response){
                    if (response.isError()) {
                        reject(response);
                    }else{
                        resolve(response);
                    }
                });
            });
        });

        // this.p.task.error(this.p.error);
    }

    function Response(xhr, request, data, status)
    {
        this.p = {
            xhr : xhr,
            request : request,
            data : data,
            status : status,
        };

        if (Response.inited === undefined) {
            Response.inited = true;

            Response.prototype.isError = function()
            {
                var status = this.getStatus();

                if (s.successStatus.indexOf(this.getStatus()) === -1) {
                    return true;
                }

                return false;
            }

            Response.prototype.getStatus = function()
            {
                return this.p.status;
            }

            Response.prototype.setStatus = function(status)
            {
                this.p.status = status;
                return this;
            }

            Response.prototype.get = function(name)
            {
                if (name === undefined) {
                    return this.p.data;
                }

                if (s.isString(this.p.data)) {
                    return this.p.data;
                }

                if (this.p.data[name] !== undefined) {
                    return this.p.data[name];
                }

                return null;
            }

            Response.prototype.getContentType = function()
            {
                var xhr = this.getXhr();

                var contentType = xhr.getResponseHeader("Content-Type");
                if (s.isNull(contentType)) {
                    return "plain/text";
                }

                return contentType;
            }

            Response.prototype.getName = function()
            {
                return this.p.request.getName();
            }

            Response.prototype.getXhr = function()
            {
                return this.p.xhr;
            }
        }
    }

    var api =
    {
        request : function(creator)
        {
            var task = taskm.task();
            var request = new Request(task);

            if (s.isFunction(creator)) {
                request.creator(creator);
            }

            return request;
        }
    }

    return api;
}));
