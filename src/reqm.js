(function (scope, factory) {
    if (typeof define === "function" && define.amd) {
        define(function(){
            return factory();
        });

    } else if (typeof module === "object" && module.exports) {
        module.exports = function() {
            return factory();
        };

    } else {
        scope.reqm = factory();
    }
}(this, function () {
    "use strict";

    var s =
    {
        binds : {},
        config : {},
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
        callAll : function(func, context)
        {
            var args = Array.prototype.slice.call(arguments);
            var func = args.shift();
            var context = args.shift();

            for(var i in func){
                func[i].apply(context, args);
            }

            return;
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

    function ResponsesTable()
    {
        var t = this;
        var p =
        {
            waiters : {}
        };

        t.wait = function(name, waiter)
        {
            if (p.waiters[name] === undefined) {
                p.waiters[name] = [];
            }

            p.waiters[name].push(waiter);
        }

        t.add = function(response)
        {
            var name = response.getName();

            if (p.waiters[name] !== undefined) {
                s.each(p.waiters[name], function(i, waiter){
                    waiter.call(t, response);
                });

                p.waiters[name] = [];
            }
        }
    }

    function Events(context)
    {
        var t = this;
        var p =
        {
            events : {},
            context
        };

        t.on = function(event, callback)
        {
            if (p.events[event] === undefined) {
                p.events[event] = [];
            }

            p.events[event].push(callback);
        }

        t.trigger = function(event, context)
        {
            var args = Array.prototype.slice.call(arguments);

            if (context === undefined && p.context !== undefined) {
                context = p.context;
            }

            if (context === undefined) {
                throw("Context of callback can not be undefined");
            }

            args.shift();
            args.shift();

            if (p.events[event] === undefined) {
                // there are no collbacks attached to that event
                return;
            }

            s.each(p.events[event], function(i, callback){
                s.needFunction(callback, "Callback of " + event + " is not function");
                callback.apply(context, args);
            });
        }
    }

    function Queue()
    {
        var t = this;
        var p =
        {
            root : null,
            stoped : false,
            responsesTable : new ResponsesTable()
        };

        p.init = function()
        {
            p.root = new Dependence(null, t);
        }

        t.stop = function()
        {
            p.stoped = true;
            return t;
        }

        t.isStoped = function()
        {
            return p.stoped === true;
        }

        t.getQueue = function()
        {
            return p.queue;
        }

        t.wait = function(name, waiter)
        {
            p.responsesTable.wait(name, waiter);
            return t;
        }

        t.registerResponse = function(response)
        {
            p.responsesTable.add(response);
            return t;
        }

        t.debugQueue = function(print)
        {
            var inded = function(level, rest){
                level = level*4;
                var inded = "";
                for(var i=1; i<=level; i++){
                    inded += " ";
                }

                return inded+rest+"\n";
            }

            var debugDependent = function(dependence, debug, level){
                var requests = dependence.getRequests();

                debug.log += inded(level, "requests : "+requests.length);

                for(var i=0; i<requests.length; i++){
                    var request = requests[i];
                    var dependences = request.getDependences();

                    debug.log += inded(level+1, "url : "+request.getUrl());
                    debug.log += inded(level+1, "method : "+request.getMethod());
                    debug.log += inded(level+1, "dependents : "+dependences.length);

                    for(var j=0; j<dependences.length; j++){
                        var dependence = dependences[j];
                        debugDependent(dependence, debug, level+2);
                    }
                }
            }

            var debug = {
                log : "",
            };

            debugDependent(p.root, debug, 0);

            if (print) {
            }

            return debug;
        }

        p.on = function(event, callback)
        {
            p.root[event](callback);
            return t;
        }

        t.onError = p.on.bind(t, "onError");
        t.onSuccess = p.on.bind(t, "onSuccess");
        t.onLoad = p.on.bind(t, "onLoad");

        p.requestMethod = function(method, creator)
        {
            p.root[method](creator);
            return t;
        }

        t.get = p.requestMethod.bind(t, "get");
        t.post = p.requestMethod.bind(t, "post");
        t.put = p.requestMethod.bind(t, "put");
        t.delete = p.requestMethod.bind(t, "delete");
        t.patch = p.requestMethod.bind(t, "path");
        t.head = p.requestMethod.bind(t, "head");
        t.request = p.requestMethod.bind(t, "request");

        t.run = function()
        {
            p.root.run(function(){});
        }

        p.init();
    }

    function Responses()
    {
        var t = this;
        var p =
        {
            responses : [],
        };

        t.addResponse = function(response)
        {
            p.responses.push(response);
            return t;
        }

        t.isError = function()
        {
            for(var i in p.responses){
                if (p.responses[i].isError()) {
                    return true;
                }
            }

            return false;
        }

        t.getErrors = function()
        {
            var errors = new Responses();

            for(var i in p.responses){
                if (p.responses[i].isError()) {
                    errors.addResponse(p.responses[i]);
                }
            }

            return errors;
        }

        t.getByName = function(name)
        {
            var responseWithName = null;

            s.each(p.responses, function(i, response){
                if (response.getName() === name) {
                    responseWithName = response;
                    return false;
                }
            });

            return responseWithName;
        }

        t.each = function(callback)
        {
            s.each(p.responses, function(i, response){
                callback.call(response, response.getName(), response);
            });

            return t;
        }

        t.getSuccess = function()
        {
            var success = new Responses();

            for(var i in p.responses){
                if (!p.responses[i].isError()) {
                    success.addResponse(p.responses[i]);
                }
            }

            return success;
        }
    }

    function Response(xhr, request)
    {
        var t = this;
        var p =
        {
            xhr : xhr,
            request : request,
            data : {},
            status : null,
        };

        t.isError = function()
        {
            var status = t.getStatus();

            if (s.successStatus.indexOf(t.getStatus()) === -1) {
                return true;
            }

            return false;
        }

        t.getStatus = function()
        {
            return p.status;
        }

        t.setStatus = function(status)
        {
            p.status = status;
            return t;
        }

        t.setData = function(data)
        {
            p.data = data;
            return t;
        }

        t.getData = function(name)
        {
            if (name === undefined) {
                return p.data;
            }

            if (s.isString(p.data)) {
                return p.data;
            }

            if (p.data[name] !== undefined) {
                return p.data[name];
            }

            return null;
        }

        t.getContentType = function()
        {
            var xhr = t.getXhr();

            var contentType = xhr.getResponseHeader("Content-Type");
            if (s.isNull(contentType)) {
                return "plain/text";
            }

            return contentType;
        }

        t.getName = function()
        {
            return p.request.getName();
        }

        t.getXhr = function()
        {
            return p.xhr;
        }
    }

    function Request(dependence, queue)
    {
        var t = this;
        var p =
        {
            url : null,
            method : null,
            binds : {},
            data : {},
            name : s.uuid(),
            description : null,
            dependences : [],
            headers : {},
            dependence : dependence,
            queue : queue,
            timeout : null,
            requestTimeout : null,
            params : {},

            events : new Events(t),
            next : null,

            control : function(response, next){
                next();
            },
        };

        /**
         * Zwraca Content-Type zdefiniowany w naglowku zadania
         */
        t.getContentType = function()
        {
            return p.headers["Content-Type"];
        }

        /**
         * Ustawia nazwe zadania.
         *
         * @param {string} name Nazwa zadania
         * @return {Request}
         */
        t.setName = function(name)
        {
            p.name = name;
            return t;
        }

        /**
         * Ustawia opis zadania.
         *
         * @param {string} description Opis zadania
         * @return {Request}
         */
        t.setDescription = function(description)
        {
            p.description = description;
            return t;
        }

        t.getName = function()
        {
            return p.name;
        }

        t.setUrl = function(url)
        {
            p.url = url;
            return t;
        }

        t.getUrl = function(resolved, withParams)
        {
            var tmp = p.url;

            resolved = resolved === undefined ? true : resolved;
            withParams = withParams === undefined ? true : withParams;

            if (resolved) {
                for(var i in p.binds){
                    tmp = tmp.replace("{"+i+"}", p.binds[i]);
                }
            }

            if (withParams) {
                var params = "?";
                var sep = "";

                s.each(p.params, function(param, value){
                    params += sep + param + "=" + encodeURIComponent(value);
                    sep = "&";
                });

                if (params !== "?") {
                    tmp += params;
                }
            }

            return tmp;
        }

        t.dependence = function(creator)
        {
            var dependence = new Dependence(t, p.queue);

            s.needFunction(creator, "Creator of dependence must be function.");
            creator.call(dependence);

            t.addDependence(dependence);
            return t;
        }

        t.addDependence = function(dependence)
        {
            p.dependences.push(dependence);
            return t;
        }

        t.setTimeout = function(timeout)
        {
            p.timeout = timeout;
            return t;
        }

        t.getDependences = function()
        {
            return p.dependences;
        }

        t.setRequestTimeout = function(timeout)
        {
            p.requestTimeout = timeout;
            return t;
        }

        t.stop = function()
        {
            p.queue.stop();
            return t;
        }

        t.setMethod = function(method)
        {
            p.method = method;
            return t;
        }

        t.getMethod = function()
        {
            return p.method;
        }

        t.setHeader = function(header, value)
        {
            p.headers[header] = value;
            return t;
        }

        t.onLoad = function(onLoad)
        {
            p.events.on("onLoad", onLoad);
            return t;
        }

        t.onError = function(onError)
        {
            p.events.on("onError", onError);
            return t;
        }

        t.onSuccess = function(onSuccess)
        {
            p.events.on("onSuccess", onSuccess);
            return t;
        }

        t.onBeforeSend = function(onBeforeSend)
        {
            p.events.on("onBeforeSend", onBeforeSend);
            return t;
        }

        t.setData = function(name, value)
        {
            if (s.isString(name)) {
                p.data[name] = value;
            }else{
                s.each(name, function(name, value){
                    p.data[name] = value;
                });
            }

            return t;
        }

        t.setParam = function(name, value)
        {
            if (s.isString(name)) {
                p.params[name] = value;
            }else{
                s.each(name, function(name, value){
                    p.params[name] = value;
                });
            }

            return t;
        }

        t.bind = function(name, value)
        {
            p.binds[name] = value;
            return t;
        }

        t.control = function(control)
        {
            p.control = control;
            return t;
        }

        t.run = function(complete)
        {
            var dependences = p.dependences;
            var count = dependences.length;

            var check = function()
            {
                if (count > 0) {
                    return;
                }

                p.execute(function(response){
                    if (response.isError()) {
                        p.events.trigger("onError", t, response);
                        s.events.trigger("onError", t, response);
                    }else{
                        p.events.trigger("onSuccess", t, response);
                        s.events.trigger("onSuccess", t, response);
                    }

                    if (p.queue.isStoped()) {
                        return;
                    }

                    p.events.trigger("onLoad", t, response);
                    s.events.trigger("onLoad", t, response);

                    if (p.queue.isStoped()) {
                        return;
                    }

                    p.queue.registerResponse(response);

                    p.control.call(t, response, function(){
                        complete(response);
                    });
                });
            }

            if (count > 0) {
                // request has dependences, i go throught dependences and call
                // then
                dependences.map(function(dependence){
                    dependence.run(function(){
                        count--;
                        check();
                    });
                });
            }else{
                check();
            }
        }

        p.execute = function(complete)
        {
            var contentType = t.getContentType();
            var data = s.encodeData(contentType, p.data);

            if (!s.isString(data)) {
                throw(contentType + " requestPreparator not return string, i can't send request.");
            }

            var xhr = new XMLHttpRequest();

            // xhr.onloadstart = function(){

            // }

            var ended = false;
            var end = function(isError, error)
            {
                if (ended) {
                    return;
                }

                // test
                isError = false;

                ended = true;

                var response = new Response(xhr, t);

                if (isError) {
                    response.setStatus(error);
                }else{
                    // response.setStatus(xhr.status);
                    response.setStatus(200);

                    // var data = s.decodeData(response.getContentType(), xhr.responseText);
                    var data = s.decodeData('application/json', '{"test" : 1}');

                    if (data === false) {
                        response.setStatus("unread");
                    }else{
                        response.setData(data);
                    }
                }

                complete.call(t, response);
            }

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

            xhr.open(t.getMethod(), t.getUrl(), true);

            // load config
            s.each(p.headers, function(header, value){
                xhr.setRequestHeader(header, value);
            });

            //p.config.events.afterOpenXhr.call(t, xhr);

            p.events.trigger("onBeforeSend", t);
            s.events.trigger("onBeforeSend", t);

            if (queue.isStoped()) {
                return;
            }

            var timeoutInit = function()
            {
                if (!s.isNull(p.timeout)) {
                    setTimeout(function() {
                        end(true, "timeout");
                    }, p.timeout);
                }
            }

            if (!s.isNull(p.requestTimeout)) {
                setTimeout(function() {
                    xhr.send(data);
                    timeoutInit();
                }, p.requestTimeout);
            }else{
                xhr.send(data);
                timeoutInit();
            }
        }
    }

    function Dependence(request, queue)
    {
        var t = this;
        var p =
        {
            request : request,
            queue : queue,
            events : new Events(t),
            requests : [],
            responses : null,
            control : function(requests, next){
                // tylko przekazujemy dalej
                next();
            },
        };

        p.requestMethod = function(method, creator)
        {
            s.needFunction(creator, "Creator of "+method+" must be function.");

            t.request(function(){
                this.setMethod(method);
                creator.call(this);
            });
        }

        t.request = function(creator)
        {
            s.needFunction(creator, "Creator of request must be function.");

            var request = new Request(t, p.queue);

            // ustawiam podstawowy timeout
            request.setTimeout(s.timeout);

            // ustawiam wartosci bindow
            for(var i in s.binds){
                request.bind(i, s.binds[i]);
            }

            // przekazuje naglowki
            for(var i in s.headers){
                request.setHeader(i, s.headers[i]);
            }

            // przepuszczam przez funkcje tworzaca
            creator.call(request);

            // dodaje request do listy
            p.requests.push({
                type : "request",
                request : request,
            });

            return t;
        }

        t.get = p.requestMethod.bind(t, "GET");
        t.post = p.requestMethod.bind(t, "POST");
        t.put = p.requestMethod.bind(t, "PUT");
        t.delete = p.requestMethod.bind(t, "DELETE");
        t.path = p.requestMethod.bind(t, "PATH");
        t.head = p.requestMethod.bind(t, "HEAD");

        /**
         * Dodaje zaleznosc oczekujaca.
         *
         * @param {string} name Nazwa zaleznosci.
         * @return {Dependence}
         */
        t.wait = function(name)
        {
            p.requests.push({
                type : "wait",
                name : name,
            });

            return t;
        }

        t.getRequests = function()
        {
            return p.requests;
        }

        t.onLoad = function(onLoad)
        {
            p.events.on("onLoad", onLoad);
            return t;
        }

        t.onError = function(onError)
        {
            p.events.on("onError", onError);
            return t;
        }

        t.onSuccess = function(onSuccess)
        {
            p.events.on("onSuccess", onSuccess);
            return t;
        }

        /**
         * Natychmiast zatrzymuje wykonywanie kolejki.
         *
         * @return {Dependence}
         */
        t.stop = function()
        {
            p.queue.stop();
            return t;
        }

        t.control = function(control)
        {
            p.control = control;
            return t;
        }

        t.run = function(complete)
        {
            // pobieram zdefiniowane requesty
            var requests = p.requests
            // zliczam ich ilosc
            var count = requests.length;

            // zmienna przetrzymuje wszystkie odpowiedzi
            var responses = new Responses();

            var check = function()
            {
                if (count > 0) {
                    // nie wszystkie request zostaly wykonane
                    return;
                }

                // wszystkie requesty sa wykonane
                if (responses.isError()) {
                    // jest blad
                    p.events.trigger("onError", t, responses.getErrors());
                    // s.events.trigger("onError", t, responses.getErrors());
                }else{
                    // wszystko jest ok
                    p.events.trigger("onSuccess", t, responses.getSuccess());
                    // s.events.trigger("onSuccess", t, responses.getSuccess());
                }

                if (queue.isStoped()) {
                    return;
                }

                // wszystko zostalo wczytane
                // p.events.trigger("onLoad", t, responses);
                // s.events.trigger("onLoad", t, responses);

                // if (queue.isStoped()) {
                //     return;
                // }

                // puszczamy dalej
                p.control.call(p.request, responses, function(){
                    complete();
                });
            }

            if (count > 0) {
                requests.map(function(request){
                    if (request.type === "request") {
                        request.request.run(function(response){
                            // i put response to list of responses
                            responses.addResponse(response);
                            count--;
                            check();
                        });
                    }else if(request.type === "wait"){
                        p.queue.wait(request.name, function(response){
                            responses.addResponse(response);
                            count--;
                            check();
                        });
                    }
                });
            }else{
                check();
            }
        }
    }

    // Kontener na zdarzenia ze wszystkich kolejek.
    s.events = new Events();

    /**
     * Generyczna metoda do tworzenia requestow
     *
     * @param {string} method Nazwa metody
     * @param {string} name Funkcja tworzaca
     * @return {Queue} Queue Instancja nowej kolejki.
     */
    function requestMethod(method, creator)
    {
        var args = Array.prototype.slice.call(arguments);
        args.shift();

        var queue = new Queue();
        queue[method].call(queue, creator);

        return queue;
    }

    function onStaticEvent(event, callback)
    {
        s.events.on(event, callback);
    }

    var api =
    {
        /**
         * Lista metod do tworzenia gotowych zadan.
         */
        get : requestMethod.bind(api, "get"),
        post : requestMethod.bind(api, "post"),
        put : requestMethod.bind(api, "put"),
        delete : requestMethod.bind(api, "delete"),
        patch : requestMethod.bind(api, "path"),
        head : requestMethod.bind(api, "head"),
        request : requestMethod.bind(api, "request"),

        /**
         * Ustawia wartosc dla wspolnej listy wartosci bindowanych.
         *
         * @param {string} name Nazwa parametru
         * @param {string} value Wartosc parametru
         * @return {object} reqm
         */
        bind : function(name, value)
        {
            s.binds[name] = value;
            return this;
        },

        /**
         * Ustawia liste statusow ktore sa nastepnie odczytywane do okreslenia
         * czy odpowiedz jest poprawna.
         *
         * @param {array} successStatus Lista statusow poprawnej odpowiedzi.
         * Standardordowa wartosc to [200, 201].
         * @return {object} reqm
         */
        setSuccessStatus : function(successStatus)
        {
            s.successStatus = successStatus;
            return this;
        },

        onError : onStaticEvent.bind(s.events, 'onError'),
        onSuccess : onStaticEvent.bind(s.events, 'onSuccess'),
        onLoad : onStaticEvent.bind(s.events, 'onLoad'),
        onBeforeSend : onStaticEvent.bind(s.events, 'onLoad'),
    }

    return api;
}));
