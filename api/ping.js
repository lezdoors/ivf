module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ pong: 'cjs', node: process.version }));
};
