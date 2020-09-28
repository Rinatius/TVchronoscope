import React, { Component } from 'react';
import './App.css';
import { extent, nest, timeFormat, sum, timeDays, range } from 'd3';
import { Button, Grid, TextField, CircularProgress } from '@material-ui/core';
import { List } from 'immutable'

import TagData from './Components/TagData/TagData'
import Charts from './Components/Charts/Charts'
import Dropzone from './Components/UploadFile/Dropzone'
import ImgGrid from "./Components/ImgGrid/ImgGrid";
import getImgsFromImg from './lukoshko/api'

class App extends Component {

  state = {
    data: List([]),
    filteredData: List([]),
    timeFilteredData: List([]),
    tag: "",
    tagSelector: "",
    nestedData: [{values: []}],
    nestedPercentData: [{values: []}],
    nestedAllTags: [],
    nestedAllTagsDates: {},
    timeRange: [],
    externalToolTip: "",
    tagModeEnabled: false,
    showCharts: false,
    file: null,
    snackbarOpen: false,
    initialImage: null,
    APIRadius: 0.93,
    spinner: false
  }

  excludeTagNegtag = (data) => {
    let result = data
    if (this.state.tag.length > 0) {
      result = data.filter(d => {
        const res = !(d.get("tags").includes(this.state.tag) ||
        d.get("negtags").includes(this.state.tag))
        console.log(res)
        return res
      })
    }
    console.log(result)
    return result
  }

  allFilter = (data=null) => {
    let filtered = data
    if (!filtered) {
      filtered = this.state.data
    }
    if (this.state.tagSelector.length > 0) {
      filtered = filtered.filter(d => d.get("tags").includes(this.state.tagSelector));
    }
    if (this.state.tagModeEnabled) {
      filtered = this.excludeTagNegtag(filtered)
    }
    this.setState({
      filteredData: filtered
    })
  };

  tagAll = (action) => {
    if (this.state.tag !== "") {
      let data = this.state.data;
      this.state.filteredData.forEach((d, i) => {
        d = this.getUpdatedTags(action,
            this.state.filteredData.get(i),
            this.state.tag)
        data = data.set(d.get("key"), d)
      })
      this.setState({data: data})
      this.allFilter(this.state.filteredData.map(d => data.get(d.get("key"))))
    } else {
      alert('Fill TAG field')
    }
  }

  tagRow = (action, index) => {
    if (this.state.tag !== "") {
      let data = this.state.data;
      const row = this.getUpdatedTags(action,
          this.state.filteredData.get(index),
          this.state.tag)
      data = data.set(row.get("key"), row)

      this.setState({
        data: data
      })
      this.setState({
        filteredData: data
      })
      this.setState({
        filteredData: this.state.filteredData.delete(index)
      })
    } else {
      alert('Fill TAG field')
    }
  }

  getUpdatedTags = (action, row, tag) => {
    if (action === 'tag') {
      row = row.update("tags", d => d.add(tag))
      row = row.update("negtags", d => d.delete(tag))
    } else if (action === 'negtag') {
      row = row.update("negtags", d => d.add(tag))
      row = row.update("tags", d => d.delete(tag))
    }
    return row;
  }

  timeFilter = (data, interval) => {
    let startTime = this.timeScale.invert(interval[0])
    let endTime = this.timeScale.invert(interval[1])
    return data.filter(d => (d.date.getTime() >= startTime &&
                             d.date.getTime() <= endTime))
  };

  nestData = () => {
    let flatData = []
    let data = this.state.data.toJS()

    //Denormalize data by tag
    data.forEach(d => d.tags.forEach(t => {
      d.tags = t
      flatData.push(d)
    }))

    //Select time unit
    let day = timeFormat("%U");//timeFormat("%Y-%m-%d");
    //Determine data time extent given time unit
    let dataExtent = extent(data, d => day(d.date));
    let timeRange = range(dataExtent[0], dataExtent[1]);
    let nestedAllTagsDates = nest().key(d => day(d.date))
                       .rollup(values => sum(values, d => +1))
                       .map(flatData);
    let nestedAllTags = timeRange.map(d => nestedAllTagsDates.get(d) || 0)
    let nested = nest().key(d => d.tags)
                       .key(d => day(d.date))
                       .rollup(values => sum(values, d => +1))
                       .map(flatData);

    //let timeRange = timeDays(dataExtent[0], dataExtent[1]).map(d => day(d));
    let zeroPadded = nested.keys()
                           .map(d => {
                             return {key: d,
                                     values: timeRange.map(t => nested.get(d).get(t) || 0)}})
    let zeroPaddedPercent = zeroPadded.map((d) => {
      return {
        key: d.key,
        values: d.values.map((t, i) => t/nestedAllTags[i]*100)
      }
    });

    this.setState({
      nestedData: zeroPadded,
      nestedPercentData: zeroPaddedPercent,
      nestedAllTags: nestedAllTags,
      nestedAllTagsDates: nestedAllTagsDates,
      timeRange: timeRange
    })
  }

  handleTagSelectorTextChange = (event) => {
    this.setState({
      tagSelector: event.target.value
    });
  };

  handleTagTextChange = (event) => {
    this.setState({
      tag: event.target.value
    });
  };

  handleFilterClick = () => {
    this.allFilter();
  };

  handleTagClick = (action) => {
    this.tagAll(action);
  };

  handleRowRemoval = (action, index) => {
    this.tagRow(action, index);
  };

  handleNestDataClick = () => {
    this.nestData();
  };

  handleDownloadDataClick = () => {
    this.downloadData()
  };

  handleTagModeChange = (event) => {
    this.setState({
      tagModeEnabled: event.target.checked
    });
  };

  handleShowCharts = () => {
    const charts = this.state.showCharts
    console.log(charts)
    this.setState({showCharts: !charts})
  }

  // Photo methods start

  handleFileChange = (file) => {
    console.log(file)
    this.setState({file: file})
  }

  handleSnackbarClick = () => {
    this.setState({snackbarOpen: true})
  };

  setInitial = (initialImage) => {
    this.setState({initialImage: initialImage})
  };

  handleAPIRadiusChange = (event) => {
    this.setState({APIRadius: event.target.value})
  };

  handlePostData = async () => {
    if (!this.state.file) {
      alert("No file to upload")
      return 0
    }
    this.setState({spinner: true})
    console.log("Sending data")
    const data = await getImgsFromImg(this.state.file, this.state.APIRadius)
    this.setState({data: data})
    this.allFilter()
    this.setState({spinner: false})
  }

  // Photo methods end

  render() {
    let charts = null;
    if (this.state.showCharts) {
      charts = <Charts
        externalToolTip={this.state.externalToolTip}
        timeRange={this.state.timeRange}
        nestedData={this.state.nestedData}
        nestedAllTags={this.state.nestedAllTags}
        nestedAllTagsDates={this.state.nestedAllTagsDates}
        timeRange={this.state.timeRange}
        nestedPercentData={this.state.nestedPercentData}
        slider={this.state.slider}
        handleSliderChange={this.handleSliderChange}
        handleSliderCommitted={this.handleSliderCommitted}
        handleNestDataClick={this.handleNestDataClick}
        handleExternalToolTip={this.handleExternalToolTip}
      />
    }

    return (
        <div className="App">

          <Grid container direction="column" alignItems="center" justify="center">
            <Grid container justify="center">
              <Dropzone handleChange={this.handleFileChange}
                        handleClick={this.handleSnackbarClick}
                        setImage={this.setInitial}/>
            </Grid>
            <Grid container justify="center">
              {this.state.initialImage ?
                  <img src={this.state.initialImage} alt="initial_image" style={{height: 300}}/>
                  :
                  null
              }
            </Grid>
            <Grid container justify="center">
              <TextField variant="outlined"
                         id="radius"
                         size="small"
                         label="Radius"
                         value={this.state.APIRadius}
                         onChange={this.handleAPIRadiusChange}/>
              <Button variant="contained"
                      size="small"
                      onClick={() => this.handlePostData()}>Send Data</Button>
              <div>
                {this.state.spinner ?
                    <CircularProgress size={32} style={{color: 'grey'}}/>
                    :
                    null
                }
              </div>
            </Grid>
          </Grid>

          <TagData
              tagModeEnabled={this.state.tagModeEnabled}
              tag={this.state.tag}
              handleTagTextChange={this.handleTagTextChange}
              handleTagClick={this.handleTagClick}
              handleTagModeChange={this.handleTagModeChange}/>

          <Button onClick={this.handleShowCharts}>Show charts</Button>
          {charts}

          <ImgGrid data={this.state.filteredData} tagClick={this.handleRowRemoval}/>
        </div>
    );
  }
}

export default App;
