module.exports = (req, res) => {
  res.status(200).json({ pong: 'js', node: process.version });
};
