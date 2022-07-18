class SpeedDial {
	constructor() {
    this.DB = openDatabase('SDX', '1', 'SDX', 1024 * 1024)

    this.DB.transaction((t) => {
      t.executeSql('CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY ASC, url TEXT, title TEXT, favicon TEXT, thumbnail TEXT, position INTEGER)')
    })

    this.getAll()
    this.initModals()
    this.initContextMenu()
	}

  getAll() {
    const items = document.querySelector('.speed-dial__tabs')
    const newTab = document.createElement('a')
    const modal = document.querySelector('.speed-dial__modal-add')

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

        newTab.addEventListener('click', () => {
          this.show(modal)
        })
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

  show(el) {
    el.classList.add('show')
  }

  hide(el) {
    el.classList.add('hide')

    setTimeout(() => {
      el.classList.remove('show', 'hide')
    }, 125)
  }

  initModals() {
    const modal    = document.querySelectorAll('.speed-dial__modal')
    const close    = document.querySelectorAll('.speed-dial__modal-close')
    const formAdd  = document.querySelector('.speed-dial__modal-add form')
    const formEdit = document.querySelector('.speed-dial__modal-edit form')
    const that     = this

    formAdd.addEventListener('submit', (e) => {
      const url = formAdd.querySelector('[name="url"]').value

      that.add(url)

      modal.forEach((el) => {
        this.hide(el)
      })

      e.preventDefault()
    })

    formEdit.addEventListener('submit', (e) => {
      const id    = formEdit.querySelector('[name="id"]').value
      const url   = formEdit.querySelector('[name="url"]').value
      const title = formEdit.querySelector('[name="title"]').value

      that.edit(id, url, title)

      modal.forEach((el) => {
        this.hide(el)
      })

      e.preventDefault()
    })

    close.forEach((el2) => {
      el2.addEventListener('click', () => {
        modal.forEach((el) => {
          this.hide(el)
        })
      })
    })

    document.addEventListener('click', (e) => {
      modal.forEach((el) => {
        if(e.target == el) {
          this.hide(el)
        }
      })
    })
  }

  initContextMenu() {
    let tab = null
    let id  = null

    document.addEventListener('contextmenu', async(e) => {
      e.preventDefault()

      const tabItem = e.target.closest('.speed-dial__tabs-item')
      let context   = document.querySelector('.speed-dial__context-menu-page')

      if(tabItem) {
        context = document.querySelector('.speed-dial__context-menu-tab')
        id      = tabItem.getAttribute('data-id')
      }

      context.style.top  = (e.clientY + context.clientHeight >= screen.height) ? `${e.clientY - context.clientHeight}px` : `${e.clientY}px`
      context.style.left = (e.clientX + context.clientWidth >= screen.width) ? `${e.clientX - context.clientWidth}px` : `${e.clientX}px`
      this.show(context)

      tab = await this.get(id)
    })

    document.addEventListener('click', async(e) => {
      const value = e.target.getAttribute('data-value')

      document.querySelectorAll('.speed-dial__context-menu').forEach((el) => {
        this.hide(el)
      })

      switch(value) {
        case 'add':
          this.show(document.querySelector('.speed-dial__modal-add'))
          break

        case 'clear':
          this.clear()
          break

        case 'newtab':
          e.target.setAttribute('href', tab.url)
          break

        case 'edit':
          const formEdit                                 = document.querySelector('.speed-dial__modal-edit form')
          formEdit.querySelector('[name="id"]').value    = tab.id
          formEdit.querySelector('[name="url"]').value   = tab.url
          formEdit.querySelector('[name="title"]').value = tab.title
          this.show(document.querySelector('.speed-dial__modal-edit'))
          break

        case 'reload':
          const res = await this.createThumbnail(tab.url)
          this.setThumbnail(tab.id, res.thumbnail)
          break

        case 'delete':
          this.delete(tab.id)
          break
      }
    })
  }
}

const SD = new SpeedDial()
