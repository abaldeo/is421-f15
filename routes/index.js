var express = require('express');
var router = express.Router();
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var moment = require('moment');
var config = require('config');
var sendgrid  = require('sendgrid')(config.get('sendgrid.api_key'));

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

router.use(['/admin','/profile','/dashboard'], verifyLoggedIn);
router.use(['/admin','/profile'], verifyIsActive);
router.use(['/admin'],verifyIsAdmin);

router.get('/admin', function(req,res,next){
  var data = [];
  req.models.users.find().order('id').each().get(function(people){
    people.forEach(function(person){
      data.push([
        person.id,
        person.fullName(),
        person.username,
        person.email,
        person.roleName(),
        person.activeStatus(),
        person.lockStatus()
      ]);
    });
    res.render('admin',{users:data,user:req.session.user,masquerade:req.session.masquerade});
  });
});

router.post('/admin', function(req,res,next){
  if(req.body.selected){
    var ids = req.body.selected;
    for(var id of ids){
      req.models.users.get(id, function(err, user){
        if (!err){
          switch(req.body.action){
            case '0':
                  console.log('granting/revoking %s admin',user.username);
                  user.is_admin = !user.is_admin;
                  user.save(handleDBError);
                  break;
            case '1':
                if (user.isLocked()) {
                  user.locked_on = null;
                  user.failed_login_attempts = 0;
                  console.log('unlocking %s account',user.username);

                }
                else{
                  user.locked_on = (new Date()).toISOString();
                  console.log('unlocking %s account',user.username);

                }
              user.save(handleDBError);
                  break;
            case '2':
                console.log('removing %s account',user.username);
                  user.remove(handleDBError);
                  break;
          }
          if (req.session.user.id  == user.id){
            console.log('updating session user');
            req.session.user = user;
            //req.session.save(function(err){});
          }
        }
      });
    }
  }
  res.redirect('/admin');
});

router.get('/about', function(req, res, next){
  res.render('about');
});

router.get('/login', function(req,res,next){
  if (req.session.user){
    res.redirect('/dashboard')
  }
  else {
    res.render('login',{csrf:req.csrfToken()});
  }
});

router.post('/login',function(req,res,next){
  console.log(req.body);
  req.models.users.find({username: req.body.username}, function (err, users){
    if (users.length > 0){
      var user = users[0];
      var challenge = bcrypt.hashSync(req.body.password,user.salt);
      if (challenge === user.password){
        console.log('authenticated');
        //entered right password but account is locked
        if (user.isLocked()){
          console.log('account locked');
          console.log(user.locked_on);
          var now = new Date();
          var utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
          utcNow.setMinutes(utcNow.getMinutes() - 5);
          console.log(utcNow);
          //check if 5 min has passed so can unlock
          if (utcNow >= user.locked_on){
            console.log('unlocking account for ' + user.id);
            user.locked_on = null;
            user.failed_login_attempts = 0;
          }
          else {
            req.flash('error', 'This account has been locked for security reasons. Please contact site administrator or \
          try again later.');
            res.redirect('/login');
            return;
          }
        }
        else{
             // on succesful login and account not locked, reset failed login attempts
            user.failed_login_attempts = 0;
        }
        user.last_login = new Date().toISOString();
        user.save(handleDBError);
        req.session.user = user;
        //req.session.user['password'] = "*".repeat(req.body.password.length);
        res.redirect('/dashboard');
      }
      else{
        //incorrect username password combo and account is already locked
        if (user.isLocked()){
          var now = new Date();
          var utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
          utcNow.setMinutes(utcNow.getMinutes() - 5);
          //check if 5 min has passed so can unlock
          if (utcNow >= user.locked_on){
            console.log('unlocking account for ' + user.id);
            user.locked_on = null;
            user.failed_login_attempts = 0;
          }
          else {
            req.flash('error', 'This account has been locked for security reasons. Please contact site administrator or \
          try again later.');
            res.redirect('/login');
          }
        }
        else{
          req.flash('warn','Username or password incorrect. Please try again.');
          res.redirect('/login');
        }
        user.failed_login_attempts += 1;
        if(user.failed_login_attempts == 3){
          console.log('locking account');
          user.locked_on = (new Date()).toISOString();
        }
        user.save();
      }
    }
    else{
      console.log('username not found');
      req.flash('warn','Username or password incorrect. Please try again.');
      res.redirect('/login');
    }
  });
});

router.get('/dashboard', function(req, res,next){
    res.render('dashboard',{user:req.session.user,masquerade:req.session.masquerade});
});

router.get('/signup', function(req,res,next){
  res.render('signup',{csrf:req.csrfToken()});
});

router.post('/signup',function(req,res,next){
  var user = {
      'username':req.body.username,
      'fname': req.body.fname,
      'lname': req.body.lname,
      'email': req.body.email,
      'phone': req.body.phone
      };
    user.salt = bcrypt.genSaltSync(10);
    user.password = bcrypt.hashSync(req.body.password, user.salt);
    user.activation_token = crypto.randomBytes(32).toString('hex');
    var tomorrow =  new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    user.activation_token_expires = tomorrow.toISOString();
    user.created_on = (new Date()).toISOString();
    req.models.users.create([user],function (err, items){
      if (err){
        if (err.constraint == 'users_email_unique'){
          console.log('duplicate email');
          req.flash('error','Duplicate email. Please try again.');
          res.render('signup');
        }
        else if (err.constraint == 'users_username_unique'){
          console.log('username already exists');
          req.flash('error','Username already exists. Please try again.');
          res.render('signup');
        }
      }
      else{
        res.render('confirm',{page:{type:'account_creation'}});
        sendConfirmationEmail(user.email,user.fname + ' ' + user.lname,user.activation_token);
      }
  });
});

router.get('/logout', function(req,res,next){
  req.session.destroy(function(err){});
  res.redirect('/login');
});

router.get('/forgot-username',function(req,res,next){
  res.render('retrieve',{username:true,csrf:req.csrfToken()})
});

router.post('/forgot-username', function(req,res,next) {
  if (req.body.email) {
    req.models.users.find({email: req.body.email}, function (err, users) {
      if (users.length == 0) {
        req.flash('error','No username found for email address provided.');
        res.redirect('/forgot-username');
      }
      else {
        res.render('retrieve',{user:users[0]});
      }
    })
  }
});

router.get('/forgot-password',function(req,res,next){
  res.render('retrieve',{password:true, csrf:req.csrfToken()});
});


router.post('/forgot-password',function(req,res,next){
  if (req.body.username){
    req.models.users.find({username:req.body.username},function(err,users){
      if (users.length == 0){
        req.flash('error','Invalid username provided.');
        res.redirect('/forgot-password');
      }
      else{
        res.render('confirm',{page:{type:'reset'}});
        var user = users[0];
        var reset_token = crypto.randomBytes(24);
        user.password_reset_link = crypto.createHash('sha256').update(reset_token).digest("hex");
        var expire = new Date();
        expire.setHours(expire.getHours()+1);
        user.password_reset_expires = expire.toISOString();
        user.save(handleDBError);
        sendResetEmail(user.email,user.fullName(),reset_token.toString('hex'));
      }
    });
  }
});

router.get('/account_confirmation/:token',function(req,res,next){
  req.models.users.find({activation_token:req.params.token},function(err,users){
    if(err){
      console.log(err);
      res.render('confirm', {page:{type:'confirm_failed'}});
    }
    else if (users.length == 0){
      console.log('invalid token provided');
      res.render('confirm',{page:{type:'invalid_link'}});
    }
    else {
      var user = users[0];
      if (user.is_active) {
        res.render('confirm',{page:{type:'already_confirmed'}});
      }
      else {
        var now = new Date();
        var todays_date = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
        var token_expire_date = user.activation_token_expires;
        if (todays_date > token_expire_date) {
          res.render('confirm', {page: {type: 'confirm_expired'}});
        }
        else {
          //force user to logout
          if (req.session.user){
            delete req.session.user;
          }
          res.render('confirm', {page: {type: 'account_confirmed'}});
          user.is_active = true;
          user.save(handleDBError);
        }
      }
    }
  });
});

router.use(['/masquerade/:id','/switchback'], function(req,res,next){
  var user = req.session.masquerade ? req.session.adminUser : req.session.user;
  if (!user)
  {
    res.redirect('/login');
  }
  if (!user.is_active || !user.is_admin){
    res.redirect('/dashboard');
  }
  else{
    next();
  }
});

router.post('/masquerade/:id',function(req,res,next){
  if (req.session.user.id == req.params.id){
    req.flash('info', 'Already Logged in as User');
    res.redirect('/admin');
  }
  else if (req.session.masquerade == true){
    req.flash('warn','Already masquerading as another user. Please switch back if you want to masquerade again.');
    res.redirect('/admin');
  }
  else {
    req.models.users.get(req.params.id, function (err, user) {
      if (!err) {
        req.session.adminUser = req.session.user;
        req.session.user = user;
        //req.session.user.password = "*".repeat(6);
        req.session.masquerade = true;
        res.redirect('/dashboard');
      }
    });
  }
});

router.post('/switchback', function(req,res,next){
    req.session.user = req.session.adminUser;
    delete req.session.adminUser;
    delete req.session.masquerade;
    res.redirect('/admin');
});

router.get('/profile', function(req,res,next){
    res.render('profile', {user: req.session.user, masquerade:req.session.masquerade});
});

router.post('/profile', function(req,res,next){
  console.log(req.body);
  req.models.users.get(req.session.user.id, function(err,user){
    if (!err) {
      user.fname = req.body.fname;
      user.username = req.body.username;
      user.lname = req.body.lname;
      user.email = req.body.email;
      user.phone = req.body.phone;
      if (req.body.password){
        if (!req.body.current_password){
          req.flash('error','Must enter current password.');
          res.render('profile',{user:req.session.user});
          return;
        }
        var challenge = bcrypt.hashSync(req.body.current_password,user.salt);
        if (challenge !== user.password){
          req.flash('Incorrect current password provided.');
          res.render('profile',{user:req.session.user});
          return;
        }
        var newChallenge = bcrypt.hashSync(req.body.password, user.salt);
        if (newChallenge === user.password){
          req.flash('error','New password cannot be same as current password');
          res.render('profile',{user:req.session.user});
          return;
        }
        var password_changed = true;
        user.salt = bcrypt.genSaltSync(10);
        //hash new password
        user.password = bcrypt.hashSync(req.body.password, user.salt);
        //remove password token and expires
        user.password_reset_link = null;
        user.password_reset_expires = null;
      }
      user.save(function(err){
        if(!err){
          if (password_changed) {
            //logout user
            req.session.destroy();
            res.redirect('/login');
          }
          else{
            req.session.user = user;
            //req.session.save(function(err){});
            res.render('profile',{user:req.session.user});
          }
        }
        else{
          if (err.constraint == 'users_email_unique'){
            req.flash('error','Cannot change email address. It is already being used. Please try again.');
            res.render('profile',{user:req.session.user});
          }
          else if (err.constraint == 'users_username_unique'){
            req.flash('error','Cannot change username. It is already in use. Please try again.');
            res.render('profile',{user:req.session.user});
          }
        }
      });
    }
  });
});

router.use('/password_reset/:token', function(req,res,next){
  console.log(req.params.token);
  try {
    var reset_token = new Buffer(req.params.token, 'hex');
    var hashed_token = crypto.createHash('sha256').update(reset_token).digest("hex");
  }
  catch(e){
    console.log(e);
    req.flash('error','Invalid password reset link.');
    res.redirect('/forgot-password');
    return;
  }
  req.models.users.find({password_reset_link:hashed_token}, function(err,users){
    if (!err){
      if (users.length == 0){
        req.flash('error', 'Invalid password reset link.');
        res.redirect('/forgot-password');
      }
      else{
        var user = users[0];
        var now = new Date();
        var utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
        //utcNow.setHours(utcNow.getHours() - 1);
        console.log(utcNow);
        console.log(user.password_reset_expires);
        if (utcNow >= user.password_reset_expires){
          req.flash('error','This password reset link has expired. Please request a new link.');
          res.redirect('/forgot-password');
        }
        else{
          req.user = user;
          next();
        }
      }
    }
  });
});

router.get('/password_reset/:token', function(req,res,next){
  res.render('reset');
});

router.post('/password_reset/:token', changeUserPassword, function(req,res,next){
  res.render('reset', {confirm: true});
  //send email
  sendResetSuccessEmail(req.user.email,req.user.fullName());
  delete req.user;
});

function changeUserPassword(req,res,next){
  var user = req.user;
  var challenge = bcrypt.hashSync(req.body.password,user.salt);
  if (challenge === user.password){
    //new password is same as old
    req.flash('error','New password cannot be same as new password');
    res.render('reset');
  }
  else {
    //proceed with password reset
    //create new salt
    user.salt = bcrypt.genSaltSync(10);
    //hash new password
    user.password = bcrypt.hashSync(req.body.password, user.salt);
    //remove password token and expires
    user.password_reset_link = null;
    user.password_reset_expires = null;
    user.save(function (err) {
      if (err) {
        console.log(err);
        req.flash('error', 'Could not reset password.');
        res.render('reset');
      }
      else {
        next();
      }
    });
  }
}

router.get('/resend_confirmation', function(req,res,next){
  res.render('retrieve',{email:true, csrf:req.csrfToken()});
});

//todo add resend password reset link ?
//todo if activation link expired resend new one, need to check if account already activated
router.post('/resend_confirmation', function(req,res,next){
  var email = req.session.user ? req.session.user.email : req.body.email;
  req.models.users.find({email:email}, function(err,users){
    if (!err){
      if (users.length == 0){
        req.flash('error','No account found for that email address');
        res.redirect('/resend_confirmation');
      }
      else{
        var user = users[0];
        var now = new Date();
        var todays_date = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
        var token_expire_date = user.activation_token_expires;
        console.log(todays_date);
        console.log(token_expire_date);
        if (todays_date >= token_expire_date){
          user.activation_token = crypto.randomBytes(32).toString('hex');
          var tomorrow =  new Date();
          tomorrow.setDate(tomorrow.getDate()+1);
          user.activation_token_expires = tomorrow.toISOString();
          user.save(function(err){
            if (!err){
              resendConfirmation(user);
              res.render('confirm', {page: {type: 'resend_confirm'}});
            }
          })
        }
        else {
          resendConfirmation(user);
          res.render('confirm', {page: {type: 'resend_confirm'}});
        }
      }
    }
  });
});

function resendConfirmation(user){
  sendConfirmationEmail(user.email, user.fname + ' ' + user.lname, user.activation_token);
}

function verifyLoggedIn(req,res,next){
  if (!req.session.user){
    res.redirect('/login');
  }
  else{
    next();
  }
}

function verifyIsActive(req,res,next){
  if (!req.session.user.is_active){
    res.redirect('/dashboard');
  }
  else{
    next();
  }
}

function verifyIsAdmin(req,res,next){
  console.log('verifying is admin');
 if (!req.session.user.is_admin){
   req.flash('warn','Must be an admin to view Administrator page.');
   res.redirect('/dashboard');
 }
 else{
   next();
 }
}

function handleDBError(err){
  if (err)
    console.log(err);
}
function sendConfirmationEmail(email,fullName, token) {
  var subject = "Welcome to NJIT UMS! Please confirm your Email";
  var body = "Thank you for creating an account with us. Please confirm your email address by clicking on the button below."

  var subs = {
    "%user%": [
      fullName
    ],
    "%url%": [
      "www.njitums.me/account_confirmation/" + token
    ],
    "%link_text%": [
      "Confirm Email"
    ],
    "%footer%": [
        ""
    ]
  };
  sendEmail(email, subject, body, subs)
}

function sendResetEmail(email, fullName, token){
  var subject = "NJIT UMS Password Reset Request";
  var body = "You are receiving this email because you (or someone else) recently requested that the password for \
              your account be reset.\nTo change your password please click here:";

  var subs = {
    "%user%": [
      fullName
    ],
    "%url%": [
      "www.njitums.me/password_reset/" + token
    ],
    "%link_text%": [
      "Reset Your Password"
    ],
    "%footer%": [
      "If you did not make this request, then please ignore this email. Your password will not be reset."
    ]
  };
  sendEmail(email,subject,body,subs);
}

function sendResetSuccessEmail(email,fullName){
  var subject = "NJIT UMS Password Has Been Changed";
  var body = "This is confirmation that the password for your account has been successfully reset.";
  var subs = {
    "%user%": [
      fullName
    ]
  };
  var template_id = "3639796f-7fc2-414c-87ee-da292f06328a";
  sendEmail(email, subject, body, subs, template_id);
}

function sendEmail(toAddress, subject, body, subs, id){
  var email     = new sendgrid.Email({
    to:       toAddress,
    from:     'no-reply@njitums.me',
    subject: subject,
    html: body
  });
  for (var tag in subs) {
    email.addSubstitution(tag, subs[tag]);
  }
  email.setFilters({
    "bypass_list_management": {
      "settings": {
        "enable": "1"
      }
    },
    "clicktrack": {
      "settings": {
        "enable": "1"
      }
    },
    "opentrack": {
      "settings": {
        "enable": "1"
      }
    },
    "templates": {
      "settings": {
        "enable": "1",
        "template_id": id || "e6ecc66f-ebb0-4032-aeca-1c36f7fc4ff0"
      }
    }
  });

  try{
    sendgrid.send(email, function(err,json){
      if (err){
        console.log('Email could not be sent to ' + toAddress);
        console.log(json);
        console.log(err);
      }
    });
  } catch(e){
    console.log(e);
  }
}

module.exports = router;
