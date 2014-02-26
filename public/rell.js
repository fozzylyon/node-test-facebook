var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {}
});

require.define("/log.js",function(require,module,exports,__dirname,__filename,process,global){var jsDump = require('jsDump')
  , $ = window.$

function safe(str) {
  var div = document.createElement('div')
  if ('innerText' in div) {
    div.innerText = str
  } else {
    div.textContent = str
  }
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/, '&#039;')
}

var Log = {
  levels: ['error', 'info', 'debug'],
  root: null,
  count: 0,

  impl: function(level) {
    return function() {
      Log.write(level, Array.prototype.slice.apply(arguments))
    }
  },

  write: function(level, args) {
    var
      hd = args.shift(),
      bd = Log.dumpArray(args)

    Log.writeHTML(level, hd, bd)
  },

  dumpArray: function(args) {
    var bd = ''

    for (var i=0, l=args.length; i<l; i++) {
      if (bd) {
        bd += '<hr>'
      }
      bd += '<pre>' + safe(jsDump.parse(args[i])) + '</pre>'
    }

    return bd
  },

  writeHTML: function(level, hd, bd) {
    if (level > Log.level) {
      return
    }

    var entry = document.createElement('div')
    entry.className = 'log-entry log-' + Log.levels[level]
    entry.innerHTML = Log.genBare(hd, bd)
    Log.root.insertBefore(entry, Log.root.firstChild)
  },

  genBare: function(hd, bd) {
    return (
      '<div class="hd">' +
        '<span class="toggle">&#9658;</span> ' +
        '<span class="count">' + (++Log.count) + '</span> ' +
        hd +
      '</div>' +
      (bd ? '<div class="bd" style="display: none;">' + bd + '</div>' : '')
    )
  },

  genHTML: function(hd, bd) {
    return '<div class="log-entry">' + Log.genBare(hd, bd) + '</div>'
  },

  clear: function() {
    Log.root.innerHTML = ''
    Log.count = 0
  },

  getLevel: function(name) {
    for (var i=0, l=Log.levels.length; i<l; i++) {
      if (name == Log.levels[i]) {
        return i
      }
    }
    return l // max level
  },

  init: function(root, levelName) {
    Log.level = Log.getLevel(levelName)
    Log.root = root
    for (var i=0, l=Log.levels.length; i<l; i++) {
      var name = Log.levels[i]
      Log[name] = Log.impl(i)
      Log[name].bind = function(title) {
        var self = this
        return function() {
          var args = Array.prototype.slice.apply(arguments)
          args.unshift(title)
          self.apply(null, args)
        }
      }
    }

    $('.log-entry .toggle').live('click', function() {
      try {
        var style = this.parentNode.nextSibling.style
        if (style.display == 'none') {
          style.display = 'block'
          this.innerHTML = '&#9660;'
        } else {
          style.display = 'none'
          this.innerHTML = '&#9658;'
        }
      } catch(e) {
        // ignore, the body is probably missing
      }
    })
  },

  flashTrace: function(title, obj) {
    Log.info(decodeURIComponent(title), decodeURIComponent(obj))
  }
}

if (typeof module !== 'undefined') module.exports = Log

});

require.define("/node_modules/jsDump/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./jsDump"}
});

require.define("/node_modules/jsDump/jsDump.js",function(require,module,exports,__dirname,__filename,process,global){/**
 * jsDump
 * Copyright (c) 2008 Ariel Flesler - aflesler(at)gmail(dot)com | http://flesler.blogspot.com
 * Licensed under BSD (http://www.opensource.org/licenses/bsd-license.php)
 * Date: 5/15/2008
 * @projectDescription Advanced and extensible data dumping for Javascript.
 * @version 1.0.0
 * @author Ariel Flesler
 * @link {http://flesler.blogspot.com/2008/05/jsdump-pretty-dump-of-any-javascript.html}
 */
var jsDump;

(function(){
	function quote( str ){
		return '"' + str.toString().replace(/"/g, '\\"') + '"';
	}
	function literal( o ){
		return o + '';
	}
	function join( pre, arr, post ){
		var s = jsDump.separator(),
			base = jsDump.indent(),
			inner = jsDump.indent(1);
		if( arr.join )
			arr = arr.join( ',' + s + inner );
		if( !arr )
			return pre + post;
		return [ pre, inner + arr, base + post ].join(s);
	}
	function array( arr ){
		var i = arr.length, ret = Array(i);
		this.up();
		while( i-- )
			ret[i] = this.parse( arr[i] );
		this.down();
		return join( '[', ret, ']' );
	}
	
	var reName = /^function (\w+)/;
	
	jsDump = {
		parse:function( obj, type ){//type is used mostly internally, you can fix a (custom)type in advance
			var parser = this.parsers[ type || this.typeOf(obj) ];
			type = typeof parser;
			
			return type == 'function' ? parser.call( this, obj ) :
				type == 'string' ? parser :
				this.parsers.error;
		},
		typeOf:function( obj ){
			var type = typeof obj,
				kind;

			if ( type == 'object' || type == 'function' ) {
				if ( obj === null )
					return 'null';

				// Extract Stuff from [Object Stuff]
				kind = Object.prototype.toString.call(obj).slice(8, -1);
				switch ( kind ) {
					case 'Array':
						return 'array';

					case 'Date':
						return 'date';

					case 'RegExp':
						return 'regexp';

					case 'Window': //Firefox, IE, Opera
					case 'DOMWindow': //WebKit
					case 'global':
						return 'window';

					case 'HTMLDocument': //WebKit, Firefox, Opera
					case 'Document': // IE
						return 'document';

					case 'NodeList':
						return 'nodelist';

					default:
						if ( 'callee' in obj )
							// Opera: Object.prototype.toString.call(arguments) == 'Object' :(
							return 'arguments';
						else if ( 'ownerDocument' in obj && 'defaultView' in obj.ownerDocument && obj instanceof obj.ownerDocument.defaultView.Node )
							return 'node';
				}
			}
			return type;
		},
		separator:function(){
			return this.multiline ? this.HTML ? '<br />' : '\n' : this.HTML ? '&nbsp;' : ' ';
		},
		indent:function( extra ){// extra can be a number, shortcut for increasing-calling-decreasing
			if( !this.multiline )
				return '';
			var chr = this.indentChar;
			if( this.HTML )
				chr = chr.replace(/\t/g,'   ').replace(/ /g,'&nbsp;');
			return Array( this._depth_ + (extra||0) ).join(chr);
		},
		up:function( a ){
			this._depth_ += a || 1;
		},
		down:function( a ){
			this._depth_ -= a || 1;
		},
		setParser:function( name, parser ){
			this.parsers[name] = parser;
		},
		// The next 3 are exposed so you can use them
		quote:quote, 
		literal:literal,
		join:join,
		_depth_: 1,
		// This is the list of parsers, to modify them, use jsDump.setParser
		parsers:{
			window: '[Window]',
			document: '[Document]',
			error:'[ERROR]', //when no parser is found, shouldn't happen
			unknown: '[Unknown]',
			'null':'null',
			undefined:'undefined',
			'function':function( fn ){
				var ret = 'function',
					name = 'name' in fn ? fn.name : (reName.exec(fn)||[])[1];//functions never have name in IE
				if( name )
					ret += ' ' + name;
				ret += '(';
				ret = [ ret, this.parse( fn, 'functionArgs' ), '){'].join('');
				return join( ret, this.parse(fn,'functionCode'), '}' );
			},
			array: array,
			nodelist: array,
			arguments: array,
			object:function( map ){
				var ret = [ ];
				this.up();
				for( var key in map )
					ret.push( this.parse(key,'key') + ': ' + this.parse(map[key]) );
				this.down();
				return join( '{', ret, '}' );
			},
			node:function( node ){
				var open = this.HTML ? '&lt;' : '<',
					close = this.HTML ? '&gt;' : '>';
				var tag = node.nodeName.toLowerCase(),
					ret = open + tag;
				for( var a in this.DOMAttrs ){
					var val = node[this.DOMAttrs[a]];
					if( val )
						ret += ' ' + a + '=' + this.parse( val, 'attribute' );
				}
				return ret + close + open + '/' + tag + close;
			},
			functionArgs:function( fn ){//function calls it internally, it's the arguments part of the function
				var l = fn.length;
				if( !l ) return '';
				var args = Array(l);
				while( l-- )
					args[l] = String.fromCharCode(97+l);//97 is 'a'
				return ' ' + args.join(', ') + ' ';
			},
			key:quote, //object calls it internally, the key part of an item in a map
			functionCode:'[code]', //function calls it internally, it's the content of the function
			attribute:quote, //node calls it internally, it's an html attribute value
			string:quote,
			date:quote,
			regexp:literal, //regex
			number:literal,
			'boolean':literal
		},
		DOMAttrs:{//attributes to dump from nodes, name=>realName
			id:'id',
			name:'name',
			'class':'className'
		},
		HTML:false,//if true, entities are escaped ( <, >, \t, space and \n )
		indentChar:'   ',//indentation unit
		multiline:true //if true, items in a collection, are separated by a \n, else just a space.
	};

})();

if (typeof exports !== 'undefined') {
	module.exports = jsDump;
}

});

require.define("/tracer.js",function(require,module,exports,__dirname,__filename,process,global){var Log = require('./log')
  , jsDump = require('jsDump')

var Tracer = {
  level: -1,
  bdCache: '',
  cache: [],

  exclude: {
    'FB.Event.subscribers': 1,
    'FB.UIServer._popupMonitor': 1,
    'FB.UIServer.__popupMonitor': 1,
    'FB.md5sum': 1,
    'FB.QS.decode': 1,
    'FB.QS.encode': 1,
    'FB.copy': 1,
    'FB.guid': 1,
    'FB.Canvas.setSize': 1,
    'FB.Canvas._computeContentSize': 1,
    'FB.Canvas._getBodyProp': 1,
    'FB.Dom.getStyle': 1,
    'FB.Array.forEach': 1,
    'FB.String.format': 1,
    'FB.log': 1
  },

  mixins: {
    'FB.EventProvider': 1
  },

  instrument: function(prefix, obj, instanceMethod) {
    if (prefix == 'FB.CLASSES') {
      return
    }

    for (var name in obj) {
      if (obj.hasOwnProperty(name)) {
        var
          val = obj[name],
          fullname = prefix + '.' + name
        if (typeof val == 'function') {
          if (instanceMethod || !val.prototype.bind) {
            obj[name] = Tracer.wrap({
              func           : val,
              instanceMethod : instanceMethod,
              name           : name,
              prefix         : prefix,
              scope          : obj
            })
          } else {
            Tracer.instrument(fullname, val.prototype, true)
          }
        } else if (typeof val == 'object') {
          Tracer.instrument(fullname, val, (fullname in Tracer.mixins))
        }
      }
    }
  },

  wrap: function(conf) {
    var name = conf.prefix + '.' + conf.name

    // things that are excluded do not get wrapped
    if (conf.func._tracerMark || name in Tracer.exclude) {
      return conf.func
    }

    var wrapped = function() {
      Tracer.level++
      Tracer.lastLevel = Tracer.level
      if (!Tracer.cache[Tracer.level]) {
        Tracer.cache[Tracer.level] = []
      }

      var
        args = Array.prototype.slice.apply(arguments),
        argsHTML = Log.dumpArray(args),
        returnValue = conf.func.apply(conf.instanceMethod ? this : conf.scope, args)

      if (returnValue) {
        argsHTML += '<hr><h3>Return Value</h3>' + jsDump.parse(returnValue)
      } else {
        argsHTML += '<hr><h3>No Return Value</h3>'
      }

      if (Tracer.lastLevel == Tracer.level) {
        Tracer.cache[Tracer.level].push(Log.genHTML(name, argsHTML))
      } else {
        Tracer.lastLevel = Tracer.level
        var children = Tracer.cache[Tracer.level+1] || []
        Tracer.cache[Tracer.level+1] = []
        Tracer.cache[Tracer.level].push(
          Log.genHTML(name, argsHTML + children.join('')))
      }

      if (Tracer.level == 0 && Tracer.cache[0][0]) {
        var entry = document.createElement('div')
        entry.className = 'log-entry log-trace'
        entry.innerHTML = Tracer.cache[0][0]
        Log.root.insertBefore(entry, Log.root.firstChild)
        Tracer.cache[0] = []
      }

      Tracer.level--

      return returnValue
    }
    wrapped._tracerMark = true
    return wrapped
  }
}

if (typeof module !== 'undefined') module.exports = Tracer

});

require.define("/rell.js",function(require,module,exports,__dirname,__filename,process,global){var Log = require('./log')
  , Tracer = require('./tracer')
  , $ = window.$

// stolen from prototypejs
// used to set innerHTML and execute any contained <scripts>
var ScriptSoup ={
  _scriptFragment: '<script[^(>|fbml)]*>([\\S\\s]*?)<\/script>',
  set: function(el, html) {
    el.innerHTML = ScriptSoup.stripScripts(html)
    ScriptSoup.evalScripts(html)
  },

  stripScripts: function(html) {
    return html.replace(new RegExp(ScriptSoup._scriptFragment, 'img'), '')
  },

  evalScripts: function(html) {
    var
      parts = html.match(new RegExp(ScriptSoup._scriptFragment, 'img')) || [],
      matchOne = new RegExp(ScriptSoup._scriptFragment, 'im')
    for (var i=0, l=parts.length; i<l; i++) {
      try {
        eval((parts[i].match(matchOne) || ['', ''])[1])
      } catch(e) {
        Log.error('Error running example: ' + e, e)
      }
    }
  }
}

var Rell = {
  /**
   * go go go
   */
  init: function(config, example) {
    window.location.hash = ''
    Rell.config = config
    Rell.config.autoRun = example ? example.autoRun : false
    Log.init($('#log')[0], Rell.config.level)
    Log.debug('Configuration', Rell.config);

    if (!window.FB) {
      Log.error('SDK failed to load.')
      return
    }

    FB.Event.subscribe('fb.log', Log.info.bind('fb.log'))
    FB.Event.subscribe('auth.login', function(response) {
      Log.info('auth.login event', response)
    })
    FB.Event.subscribe('auth.statusChange', Rell.onStatusChange)

    if (Rell.config.trace) {
      Tracer.instrument('FB', FB)
    }

    if (!Rell.config.init) {
      return;
    }

    var options = {
      appId : Rell.config.appID,
      cookie: true,
      status: Rell.config.status,
      frictionlessRequests: Rell.config.frictionlessRequests
    }

    FB.init(options)
    if (top != self) {
      FB.Canvas.setAutoGrow(true)
    }

    if (!Rell.config.status) {
      Rell.autoRunCode()
    } else {
      FB.getLoginStatus(function() { Rell.autoRunCode() })
      FB.getLoginStatus(Rell.onStatusChange)
    }

    $('#rell-login').click(Rell.login)
    $('#rell-disconnect').click(Rell.disconnect)
    $('#rell-logout').click(Rell.logout)
    $('#rell-run-code').click(Rell.runCode)
    $('#rell-log-clear').click(Rell.clearLog)
    Rell.setCurrentViewMode()
    if (example && !example.autoRun) {
      Rell.setupAutoRunPopover()
    }
    $('.has-tooltip').tooltip()
  },

  onStatusChange: function(response) {
    var status = response.status
    $('#auth-status').removeClass().addClass(status).html(status)
  },

  autoRunCode: function() {
    if (Rell.config.autoRun) Rell.runCode()
  },

  /**
   * Run's the code in the textarea.
   */
  runCode: function() {
    Log.info('Executed example')
    var root = $('#jsroot')[0]
    ScriptSoup.set(root, Rell.getCode())
    FB.XFBML.parse(root)
  },

  getCode: function() {
    return $('#jscode').val()
  },

  login: function() {
    FB.login(Log.debug.bind('FB.login callback'))
  },

  logout: function() {
    FB.logout(Log.debug.bind('FB.logout callback'))
  },

  disconnect: function() {
    FB.api({ method: 'Auth.revokeAuthorization' }, Log.debug.bind('revokeAuthorization callback'))
  },

  setCurrentViewMode: function() {
    var select = $('#rell-view-mode')
    if (window.name.indexOf('canvas') > -1) {
      select.val('canvas') // context.Canvas
    } else if (window.name.indexOf('app_runner') > -1) {
      select.val('page-tab') // context.PageTab
    } else if (self === top) {
      select.val('website') // context.Website
    }
  },

  setupAutoRunPopover: function() {
    var el = $('#rell-run-code')
    el.popover('show')
    el.hover(function() { el.popover('hide') })
  },

  clearLog: function() {
    Log.clear()
    return false
  }
}

if (typeof module !== 'undefined') module.exports = Rell

});
require("/rell.js");

