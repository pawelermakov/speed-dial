class SpeedDial {
	constructor() {
    this.DB = openDatabase('SDX', '1', 'SDX', 1024 * 1024)

    this.DB.transaction((t) => {
      t.executeSql('CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY ASC, url TEXT, title TEXT, favicon TEXT, thumbnail TEXT, position INTEGER)')
    })

    this.getAll()
	}

  getAll() {
    const items = document.querySelector('.speed-dial__tabs')
    const newTab = document.createElement('a')

    items.innerHTML = ''

		this.DB.transaction((t) => {
			t.executeSql('SELECT * FROM bookmarks ORDER BY position', [], (transaction, results) => {
				for(let i = 0; i < results.rows.length; i++) {
					let row = results.rows.item(i)
          let item = document.createElement('a')

          item.classList.add('speed-dial__tabs-item')
          item.setAttribute('href', row.url)
          item.setAttribute('data-id', row.id)
          item.setAttribute('style', `background-image:url(${row.thumbnail})`)
          item.innerHTML = `<div class="speed-dial__tabs-item-title"><div class="speed-dial__tabs-item-title-icon" style="background-image:url(${row.favicon})"></div><div class="speed-dial__tabs-item-title-text">${row.title}</div></div>`

          items.appendChild(item)
				}

        newTab.classList.add('speed-dial__tabs-item-new')
        newTab.setAttribute('href', '#')
        items.appendChild(newTab)
			})
		})
  }

  async get(id) {
	  if(id) {
      return new Promise((resolve) => {
        this.DB.transaction((t) => {
          t.executeSql('SELECT * FROM bookmarks WHERE id=?', [id], (transaction, results) => {
            resolve(results.rows.item(0))
          })
        })
      })
    }
  }

  async getPosition() {
	  return new Promise((resolve) => {
      this.DB.transaction((t) => {
        t.executeSql('SELECT * FROM bookmarks ORDER BY position', [], (transaction, results) => {
          let position = 0

          for(let i = 0; i < results.rows.length; i++) {
            let row = results.rows.item(i)
            position = (row.position > position) ? row.position : position
          }

          resolve(position + 1)
        })
      })
    })
	}

	setPosition(id, position) {
	  this.DB.transaction((t) => {
      t.executeSql('UPDATE bookmarks SET position=? WHERE id=?', [position, id])
    })
  }

  async add(url) {
    const res = await this.createThumbnail(url)
    const favicon = res.favicon || `https://favicon.yandex.net/favicon/v2/${url}?size=32&stub=1`
    const position = await this.getPosition()

		this.DB.transaction((t) => {
			t.executeSql('INSERT INTO bookmarks (url, title, favicon, thumbnail, position) VALUES (?, ?, ?, ?, ?)', [url, res.title, favicon, res.thumbnail, position], (tx, results) => {
        this.getAll()
			})
		})
  }

  edit(id, url, title) {
    this.DB.transaction((t) => {
			t.executeSql('UPDATE bookmarks SET url=?, title=? WHERE id=?', [url, title, id], (tx, results) => {
        this.getAll()
      })
		})
  }

  delete(id) {
    if(confirm('Вы действительно хотите удалить закладку?')) {
      this.DB.transaction((t) => {
        t.executeSql('DELETE FROM bookmarks WHERE id=?', [id], (tx, results) => {
          this.getAll()
        })
      })
    }
  }

  clear() {
    if(confirm('Вы действительно хотите удалить все закладки?')) {
      this.DB.transaction((t) => {
        t.executeSql('DELETE FROM bookmarks', [], (tx, results) => {
          this.getAll()
        })
      })
    }
  }

  async createThumbnail(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({act: 'thumbnail', url: url}, function(response) {
        resolve(response)
      })
    })
  }

  setThumbnail(id, thumbnail) {
    this.DB.transaction((t) => {
      t.executeSql('UPDATE bookmarks SET thumbnail=? WHERE id=?', [thumbnail, id], (tx, results) => {
        this.getAll()
      })
    })
  }
}

const SD = new SpeedDial()
