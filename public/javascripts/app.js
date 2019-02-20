function format_bytes(bytes) {
	const units = [[1000000, "M"], [1000, "k"]];

	for (const unit of units) {
		if (bytes > unit[0]) {
			const count = Math.floor((bytes / unit[0]) * 100) / 100;
			return count + unit[1] + "B";
		}
	}

	return bytes + "B";
}

function formatNote(format) {
	let res = "";

	if (format.ext in ["f4f", "f4m"]) res += "(unsupported) ";
	if (format.language) {
		if (res) res += " ";
		res += "[" + format["language"] + "] ";
	}
	if (format.format_note) res += format["format_note"] + " ";
	if (format.tbr) res += format["tbr"] + "k ";
	if (format.container) {
		if (res) res += ", ";
		res += format["container"] + " container";
	}
	if (format.vcodec && format.vcodec != "none") {
		if (res) res += ", ";
		res += format["vcodec"];
		if (format.vbr) res += "@";
	} else if (format.vbr && format.abr) res += "video@";
	if (format.vbr) res += format["vbr"] + "k";
	if (format.fps) {
		if (res) res += ", ";
		res += format["fps"] + "fps";
	}
	if (format.acodec) {
		if (res) res += ", ";
		if (format["acodec"] == "none") res += "video only";
		else res += format["acodec"];
	} else if (format.abr) {
		if (res) res += ", ";
		res += "audio";
	}
	if (format.abr) res += "@" + format["abr"] + "k";
	if (format.asr) res += " (" + format["asr"] + "Hz)";
	if (format.filesize) {
		if (res) res += ", ";
		res += format_bytes(format["filesize"]);
	} else if (format.filesize_approx) {
		if (res) res += ", ";
		res += "~" + format_bytes(format["filesize_approx"]);
	}
	return res;
}

function fuzzyTime(time) {
	const units = [
		[1000 * 60 * 60 * 24 * 365.25, "year"],
		[1000 * 60 * 60 * 24 * 30.4375, "month"],
		[1000 * 60 * 60 * 24 * 7, "week"],
		[1000 * 60 * 60 * 24, "day"],
		[1000 * 60 * 60, "hour"],
		[1000 * 60, "minute"]
	];

	const Δ = new Date() - time;

	for (const unit of units) {
		if (Δ > unit[0]) {
			const count = Math.floor(Δ / unit[0]);
			return `${count === 1 ? (unit[1] === "hour" ? "an" : "a") : count} ${unit[1]}${count !== 1 ? "s" : ""} ago`;
		}
	}

	return `a few seconds ago`;
}

class App extends React.Component {
	constructor(props) {
		super(props);

		this.state = {
			developmentMode: "_self" in React.createElement("div"),
			loading: false,
			error: "",
			step: 0,

			selectedWay: "bestqc",

			videoInfo: {},
			videoIdentifier: null,
			videoCheckInterval: null,
			videoDownloadProgress: 0
		};
	}

	_urlSubmit = (e) => {
		e.preventDefault();

		this.setState({ error: "", loading: true });

		fetch("./getInfo", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ url: e.target.elements.url.value })
		})
			.then((resp) => {
				resp.json()
					.then((respJSON) => {
						if (!respJSON.success)
							return this.setState({
								error: "Failed: " + respJSON.error,
								step: 0,
								loading: false
							});

						this.setState({
							videoInfo: respJSON.payload,
							step: 1,
							loading: false
						});
					})
					.catch((err) => {
						this.setState({
							error: "Server did not send a correct response: " + err,
							step: 0,
							loading: false
						});
					});
			})
			.catch((err) => {
				this.setState({
					error: "Contacting the server failed: " + err,
					step: 0,
					loading: false
				});
			});

		return false;
	};

	_formatSubmit = (e) => {
		e.preventDefault();

		this.setState({ error: "", loading: true });

		fetch("./startDownload", {
			method: "POST",
			body: new URLSearchParams(new FormData(e.target))
		})
			.then((resp) => {
				resp.json()
					.then((respJSON) => {
						if (!respJSON.success)
							return this.setState({
								error: "Failed: " + respJSON.error,
								loading: false
							});

						this.setState({
							videoIdentifier: respJSON.payload,
							videoCheckInterval: setTimeout(() => {
								this._checkDownloadProgress();
							}, 2000),
							step: 2,
							loading: false
						});
					})
					.catch((err) => {
						this.setState({
							error: "Server did not send a correct response: " + err,
							loading: false
						});
					});
			})
			.catch((err) => {
				this.setState({
					error: "Contacting the server failed: " + err,
					loading: false
				});
			});

		return false;
	};

	_checkDownloadProgress = () => {
		fetch("./checkDownload/" + this.state.videoIdentifier)
			.then((resp) => {
				resp.json()
					.then((respJSON) => {
						if (!respJSON.success)
							return this.setState({
								error: "Failed: " + respJSON.error,
								step: 1
							});

						if (!respJSON.payload.done) {
							this.setState({ videoDownloadProgress: respJSON.payload.progress });
							setTimeout(() => {
								this._checkDownloadProgress();
							}, 2000);
						} else {
							return this.setState({
								step: 3
							});
						}
					})
					.catch((err) => {
						this.setState({
							error: "Server did not send a correct response: " + err,
							step: 1
						});
					});
			})
			.catch((err) => {
				this.setState({
					error: "Contacting the server failed: " + err,
					step: 0,
					loading: false
				});
			});
	};

	_pickedWay = (e) => {
		this.setState({ selectedWay: e.target.value });
	};

	render() {
		return (
			<React.Fragment>
				{this.state.developmentMode ? <p style={{ color: "red" }}>Running in development mode.</p> : null}
				{this.state.error.length ? <pre style={{ color: "red" }}>Error: {this.state.error}</pre> : null}

				{this.state.loading ? <div id="loading">Please wait...</div> : null}
				<div className="container">
					{this.state.step !== 0 ? (
						<React.Fragment>
							<div className="videoInfo">
								{this.state.videoInfo.thumbnail ? (
									<img src={this.state.videoInfo.thumbnail} alt="Video thumbnail" className="thumb" />
								) : null}
								<div className="info">
									<div>
										<strong className="title">{this.state.videoInfo.fulltitle}</strong>
									</div>
									<div>
										Uploaded by <strong>{this.state.videoInfo.uploader || "[unknown]"}</strong> at{" "}
										<strong>{this.state.videoInfo.upload_date || "[unknown]"}</strong>
									</div>
									<div>
										Duration:{" "}
										<strong>
											{this.state.videoInfo.duration
												? new Date(1000 * this.state.videoInfo.duration)
														.toISOString()
														.substr(11, 8)
												: "[unknown]"}
										</strong>
									</div>
									<div>
										From{" "}
										<strong>
											{this.state.videoInfo.extractor_key} (
											{new URL(this.state.videoInfo.webpage_url).hostname})
										</strong>
									</div>
									{this.state.videoInfo.description ? (
										<div>
											Description:
											<textarea
												rows="3"
												style={{ width: "100%" }}
												disabled
												value={this.state.videoInfo.description}
											/>
										</div>
									) : null}
								</div>
							</div>
							<div className="_clearfix" />
						</React.Fragment>
					) : null}

					{this.state.step === 0 ? (
						<form className="input" onSubmit={this._urlSubmit}>
							URL:
							<input type="url" name="url" required disabled={this.state.loading} />
							<input type="submit" value="Go!" disabled={this.state.loading} />
						</form>
					) : this.state.step === 1 ? (
						<form onSubmit={this._formatSubmit}>
							<input type="hidden" name="url" value={this.state.videoInfo.webpage_url} />
							<div style={{ textAlign: "center" }}>
								Output:{" "}
								<select
									name="out"
									defaultValue={this.state.videoInfo.vcodec !== "none" ? "mp4" : "mp3"}
									value={this.state.selectedOutput}>
									<option value="mp4">.mp4</option>
									<option value="mkv">.mkv</option>
									<option value="webm">.webm</option>
									<option value="mov">.mov</option>
									<option disabled>---</option>
									<option value="mp3">.mp3</option>
									<option value="m4a">.m4a</option>
									<option value="aac">.aac</option>
									<option value="opus">.opus</option>
								</select>
							</div>
							<br />
							<br />
							<input
								type="radio"
								name="how"
								onChange={this._pickedWay}
								value="bestqc"
								defaultChecked
							/>{" "}
							Best quality video + audio and convert (or fit) to the selected output
							{this.state.videoInfo.formats instanceof Array ? (
								<React.Fragment>
									<br />
									<br />
									<input type="radio" name="how" onChange={this._pickedWay} value="customfc" /> Custom
									video + audio format and convert (or fit) to the selected output
									<br />
									<input type="radio" name="how" onChange={this._pickedWay} value="customfs" /> Single
									format only (don't convert)
									<table
										className="formats"
										style={{
											display: this.state.selectedWay.startsWith("custom") ? "table" : "none"
										}}>
										<thead>
											<tr>
												<th />
												<th>Format code</th>
												<th>Extension</th>
												<th>Resolution</th>
												<th>Note</th>
											</tr>
										</thead>
										<tbody>
											{Object.keys(this.state.videoInfo.formats).map((i) => (
												<tr key={this.state.videoInfo.formats[i].format_id}>
													<td>
														<input
															type="checkbox"
															name="format"
															value={this.state.videoInfo.formats[i].format_id}
														/>
													</td>
													<td>{this.state.videoInfo.formats[i].format_id}</td>
													<td>{this.state.videoInfo.formats[i].ext}</td>
													<td>
														{!this.state.videoInfo.formats[i].width
															? "audio only"
															: this.state.videoInfo.formats[i].width +
															  "x" +
															  this.state.videoInfo.formats[i].height}
													</td>
													<td>{formatNote(this.state.videoInfo.formats[i])}</td>
												</tr>
											))}
										</tbody>
									</table>
									<div
										style={{
											display:
												this.state.videoInfo.subtitles &&
												Object.keys(this.state.videoInfo.subtitles).length
													? "block"
													: "none"
										}}>
										<br />
										<input type="checkbox" name="subtitle" defaultChecked /> Embed subtitles (mp4,
										webm and mkv only)
									</div>
								</React.Fragment>
							) : null}
							<input type="submit" value="Download~" className="download" />
						</form>
					) : this.state.step === 2 ? (
						<div style={{ textAlign: "center" }}>
							<p>Please be patient, your download is on its way...</p>
							<div className="progress">
								<div className="indicator" style={{ width: this.state.videoDownloadProgress + "%" }}>
									<div className="percent">{Math.round(this.state.videoDownloadProgress) + "%"}</div>
								</div>
							</div>
						</div>
					) : this.state.step === 3 ? (
						<div style={{ textAlign: "center" }}>
							<p>Your download is complete! Enjoy~ uwu</p>
							<p>
								<a href={"./download/" + this.state.videoIdentifier}>
									{location.origin + location.pathname + "download/" + this.state.videoIdentifier}
								</a>
							</p>
							<br />
							<br />
							<button
								onClick={() => {
									location.reload();
								}}>
								Another one~
							</button>
						</div>
					) : null}
				</div>
				<hr />
				<div className="video-list">
					<div className="header">Recent videos</div>
					{videoList.length ? (
						<ul>
							{videoList.map((v) => (
								<li key={v.time}>
									<a href={"./download/" + v.time} target="_blank" rel="noopener noreferrer">
										{v.name}
									</a>
									<br />
									Downloaded {fuzzyTime(v.time)}
								</li>
							))}
						</ul>
					) : (
						<div className="empty">( no videos downloaded recently )</div>
					)}
				</div>
				<hr />
				<p className="_small _it">
					All downloaded videos will be deleted in 2 hours to preserve disk space.
					<br />
					<br />
					Using&nbsp;
					<a href="http://rg3.github.com/youtube-dl/" target="_blank" rel="noopener noreferrer">
						youtube-dl
					</a>
					&nbsp;version {youtubeDLVersion} with {youtubeDLExtractors.length} extractors&nbsp;
					<a
						href="javascript:;"
						onClick={(e) => {
							document.querySelector(".extractor-list").style.display =
								document.querySelector(".extractor-list").style.display !== "block" ? "block" : "none";
						}}>
						(toggle)
					</a>
				</p>
				<div className="extractor-list">
					<ul>
						{youtubeDLExtractors.map((e, i) => (
							<li key={i}>{e}</li>
						))}
					</ul>
				</div>
			</React.Fragment>
		);
	}
}

ReactDOM.render(<App />, document.getElementById("app"));
