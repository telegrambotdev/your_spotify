const express = require('express');

const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validating, logged, withGlobalPreferences } = require('../tools/middleware');
const constants = require('../tools/constants');
const db = require('../database');
const logger = require('../tools/logger');

router.get('/', (req, res) => {
  res.status(200).send('Hello !');
});

const registerSchema = Joi.object().keys({
  username: Joi.string().max(constants.maxStringLength).required(),
  password: Joi.string().max(constants.maxStringLength).required(),
});

router.post('/register', validating(registerSchema), withGlobalPreferences, async (req, res) => {
  const { globalPreferences } = req;

  if (!globalPreferences || !globalPreferences.allowRegistrations) {
    return res.status(401).send({ code: 'REGISTRATIONS_NOT_ALLOWED' });
  }

  const { username, password } = req.values;

  const alreadyExisting = await db.getUserFromField('username', username, false);

  if (alreadyExisting) {
    return res.status(409).send({ code: 'USER_ALREADY_EXISTS' });
  }

  const hashedPassword = bcrypt.hashSync(password, 14);

  const newUser = await db.createUser(username, hashedPassword);
  return res.status(200).send(newUser);
});

router.post('/logout', async (req, res) => {
  res.clearCookie('token');
  return res.status(200).end();
});

const loginSchema = Joi.object().keys({
  username: Joi.string().max(constants.maxStringLength).required(),
  password: Joi.string().max(constants.maxStringLength).required(),
});

router.post('/login', validating(loginSchema), async (req, res) => {
  const { username, password } = req.values;

  const user = await db.getUserFromField('username', username, false);

  if (!user) {
    return res.status(400).send({ code: 'INCORRET_PASSWORD' });
  }

  // TODO filter user

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).send({ code: 'INCORRECT_PASSWORD' });
  }

  const token = jwt.sign({ userId: user._id.toString() }, 'MyPrivateKey', {
    expiresIn: '1h',
  });

  res.cookie('token', token);

  return res.status(200).send({
    user,
    token,
  });
});

const settingsSchema = Joi.object().keys({
  historyLine: Joi.bool(),
  preferredStatsPeriod: Joi.string().only().allow('day', 'week', 'month', 'year'),
  nbElements: Joi.number().min(5).max(50),
  metricUsed: Joi.string().allow('number', 'duration').only(),
});

router.post('/settings', validating(settingsSchema), logged, async (req, res) => {
  const { values, user } = req;

  try {
    await db.changeSetting('_id', user._id, values);
    return res.status(200).end();
  } catch (e) {
    logger.error(e);
    return res.status(500).end();
  }
});

router.get('/me', logged, async (req, res) => res.status(200).send(req.user));

module.exports = router;
