const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const async = require('async');

const User = require('../model/user');
const { error } = require('console');

function isAuthenticatedUser(req, res, next) {
    if(req.isAuthenticated()){
        return next();
    }
    req.flash('error_msg', 'Please Login first to access the page');
    res.redirect('/login');
}

router.get('/login', (req, res) =>{
    res.render('login');
});

router.get('/signup', (req, res) =>{
    res.render('signup');
});

router.get('/dashboard', isAuthenticatedUser, (req, res) => {
    res.render('dashboard');
});

router.get('/logout', isAuthenticatedUser, (req, res) => {
    req.logOut(err =>{
        if(err) {
            req.flash('error_msg', 'Something went wrong. Try Logging in again...');
            res.redirect('/login');
        }
        req.flash('success_msg', 'User Logged Out Successfully');
        res.redirect('login');
    });
});

router.get('/forgot', (req, res) => {
    res.render('forgot');
});

router.get('/reset/:token', (req, res) => {
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}})
    .then(user=>{
        if(!user){
            req.flash('error_msg', 'Password Reset token is invalid or it has is expired');
            res.redirect('/forgot');
        }
        res.render('newpassword', {token: req.params.token});
    })
    .catch(error => {
        req.flash('error_msg', 'Error: '+error);
        res.redirect('/forgot');
    });
});

router.get('/password/change', isAuthenticatedUser, (req, res) => {
    res.render('changepassword');
});

router.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: 'Invalid Email or Password. Please try again...'
}));

router.post('/signup', (req, res)=> {
    let {name, email, password} = req.body;
    let userData = {name, email};
    User.register(userData, password, (err, user)=>{
        if(err){
            req.flash('error_msg','Error: '+err);
            res.redirect('/signup');
        }
        passport.authenticate('local') (req, res, ()=> {
            req.flash('success_msg', 'Account Created Successfully');
            res.redirect('/login');
        });
    });
});

router.post('/password/change', (req, res) => {
    if(req.body.password !== req.body.confirmpassword){
        req.flash('error_msg','Password dont match. Please Type Again!');
        return res.redirect('/password/change');
    }
    User.findOne({email: req.user.email})
    .then(user => {
        user.setPassword(req.body.password, err =>{
            user.save()
            .then(user => {
                req.flash('success_msg', 'Password Changed Successfully.');
                res.redirect('/dashboard');
            })
            .catch(err =>{
                req.flash('error_msg', 'Error: '+err);
                res.redirect('/password/change');
            });
        });
    });
});

const generateRandomBytes = async ()=>{
    crypto.randomBytes(20, (err, buf)=>{
        let token = buf.toString('hex');
        console.log(token);
        return token;
});
}

const saveToken = async (req, res, token) =>{
    const user = await User.findOne({email: req.body.email})
    if(!user) {
        req.flash('error_msg', 'User does not exist with this Email!');
        return res.redirect('/forgot');
    }
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 1800000;
    await user.save();
    console.log("Token Saved");
    return user;
}

const sendingMail = async(req,res, token, user)=>{
    console.log('preparing mail');
    let smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.GMAIL_USER_EMAIL,
            pass: process.env.GMAIL_PASSWORD
        }
    });
    let mailOptions = {
        to: user.email,
        from: 'Md Arif @ techsoftmd22@gmail.com',
        subject: 'Recovery Email from Auth-App',
        text: 'Please click the following link to recover your password. \n\n'+
              'http://'+req.headers.host+'/reset/'+token+'\n\n' +
              'If you did not request this, Please Ignore this email.'
    };
    console.log('sending email');
    smtpTransport.sendMail(mailOptions, err =>{
        console.log('mail sent');
        req.flash('success_msg', 'Email sent with further instructions. Please check and reset your password.');
        res.redirect('/forgot');
    });
}

const forgotFunction = async(req,res) =>{
    let tokenReceived='';
    try {
        crypto.randomBytes(20, async(err, buf)=>{
            tokenReceived = buf.toString('hex');
            console.log(tokenReceived);
            const user = await saveToken(req, res, tokenReceived);
            console.log('token saved from forgot function');
            await sendingMail(req, res, tokenReceived, user);
        })
    } catch(err){
        console.log(err);
        req.flash('error_msg', 'Error: '+err);
        res.redirect('/forgot');
    }
}

router.post('/forgot', async(req, res)=>{
    forgotFunction(req, res);
});


router.post('/reset/:token', (req, res)=>{
    async.waterfall([
        (done)=>{
            User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}})
                .then(user =>{
                    if(!user){
                        req.flash('error_msg','Password reset token is invalid or it is expired.');
                        res.redirect('/forgot');
                    }
                    if(req.body.password !== req.body.confirmpassword){
                        req.flash('error_msg','Password Dont Match. Please try again...');
                        return res.redirect('/forgot');
                    }

                    user.setPassword(req.body.password, err =>{
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save().then(err => {
                            req.logIn(user, err =>{
                                done(err, user);
                            })
                        });
                    });
                })
                .catch(err =>{
                    req.flash('error_msg', 'Error: '+ err);
                })
        },
        (user)=>{
            let smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: process.env.GMAIL_USER_EMAIL,
                    pass: process.env.GMAIL_PASSWORD
                }
            });
            let mailOptions = {
                to: user.email,
                from: 'Md Arif @ techsoftmd22@gmail.com',
                subject: 'Password Changed.',
                text: 'Hello, '+ user.name+', \n\n'+
                      'This is the confirmation that the password for your Account '+user.email +
                      ' has been changed.'
            };
            smtpTransport.sendMail(mailOptions, err=>{
                req.flash('success_msg', 'Your password has been changed successfully.');
                res.redirect('/login');
            });
        }

    ], err => {
        res.redirect('/login');
    });
});


module.exports = router;