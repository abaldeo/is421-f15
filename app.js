var express = require('express');
var orm =  require('orm');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var flash = require('express-flash');
var csrf = require('csurf');
var routes = require('./routes/index');
var users = require('./routes/users');

var pgSession = require('connect-pg-simple')(session);
var app = express();
var config = require('config');

const dbConnStr =config.get('db.connStr');

app.use(orm.express(dbConnStr,
    {
      define: function (db, models, next) {
        models.users = db.define("users", {
              id: {type: 'serial',key:true},
              email: {type: 'text', unique: true, required: true},
              username: {type: 'text', size:64, unique: true, required: true},
              password: {type: 'text', size:50, required: true},
              salt: {type:'text',size:29, unique:true, required:true},
              fname: {type:'text', size:35, required:true},
              lname: {type:'text',size:35, required:true},
              phone: {type:'number', required:true},
              is_admin: {type:'boolean',defaultValue:false,required:true},
              is_active: {type:'boolean',defaultValue:false,required:true},
              created_on: {type:'date',required:true,time:true},
              last_login: {type:'date', time:true},
              activation_token: {type:'text',unique:true},
              activation_token_expires: {type:'date',time:true},
              password_reset_link: {type:'text', unique:true},
              password_reset_expires: {type:'date', time:true},
              failed_login_attempts: {type:'number', defaultValue:0},
              locked_on: {type:'date', time:true}
            },
            {
                methods: {
                    fullName: function(){
                        return this.fname + ' ' + this.lname;
                    },
                    roleName: function(){
                        return this.is_admin ? 'Admin' : 'Regular'
                    },
                    activeStatus: function(){
                        return this.is_active ? 'Yes' : 'No'
                    },
                    lockStatus: function(){
                        return this.locked_on !== null ? 'Yes' : 'No'
                    },
                    isLocked: function(){
                        return this.locked_on !== null
                    }
                },
                hooks: {
                    afterLoad:function(){
                        if (this.locked_on){
                            var now = new Date();
                            var utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
                            utcNow.setHours(utcNow.getHours() - 1);
                            if (utcNow >= this.locked_on){
                                console.log('unlocking account for ' + this.id);
                                this.locked_on = null;
                                this.failed_login_attempts = 0;
                            }
                        }
                    }
                }
            }
        );
        db.sync(function(err){
          if (err) throw err;
        });
        next();
      }
    }));


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('secret',"M-%SiuBcVQNywGWF~wCMlJ-VQtfgP*ds3|_k+*OhoK|f0zLJ*B9EOc8hYy24");
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(app.get('secret')));
app.use(session({
    store: new pgSession({
        conString: dbConnStr
    }) ,
    secret: app.get('secret'),
    cookie: { maxAge: 60 * 15 * 1000},
    saveUninitialized: false,
    resave: true
}));
app.use(['/login','/signup','/forgot-username','/forgot-password','/resend_confirmation'],csrf());
app.use(express.static(path.join(__dirname, 'public')));
app.use(flash());

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.listen(80);
module.exports = app;
