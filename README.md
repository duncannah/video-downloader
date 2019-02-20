# Duncan's video downloader~

A basic web frontend for [youtube-dl](https://rg3.github.io/youtube-dl). Designed to be mobile-friendly.

<center>
	<img src="https://i.imgur.com/m5MxQXp.png"/>
</center>

## Security

There are little to no checks in place, as this was designed to be only used by trusted parties. Run under caution.

## Running

```bash
# run server
NODE_ENV="production" npm start

# debug
DEBUG=video-downloader:* npm start

# set `PORT` to set the port.
```

Python 3 is required. Only designed to run on \*nix.

## License

This software is licensed under the GNU Affero General Public License v3.0. A copy can be found under [LICENSE](LICENSE).
