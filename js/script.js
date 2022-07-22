class SpeedDial {
	constructor() {
    this.DB = openDatabase('SDX', '1', 'SDX', 1024 * 1024)

    this.DB.transaction((t) => {
      t.executeSql('CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY ASC, url TEXT, title TEXT, favicon TEXT, thumbnail TEXT, position INTEGER)')
    })

    this.getAll()
    this.initModals()
    this.initContextMenu()
    this.initSearch()
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
          item.setAttribute('draggable', 'true')
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

        this.initSorting()
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
    const modal = document.querySelectorAll('.speed-dial__modal')
    const close = document.querySelectorAll('.speed-dial__modal-close')
    const formAdd = document.querySelector('.speed-dial__modal-add form')
    const formEdit = document.querySelector('.speed-dial__modal-edit form')
    const that = this

    formAdd.addEventListener('submit', (e) => {
      const url = formAdd.querySelector('[name="url"]').value

      that.add(url)

      modal.forEach((el) => {
        this.hide(el)
      })

      e.preventDefault()
    })

    formEdit.addEventListener('submit', (e) => {
      const id = formEdit.querySelector('[name="id"]').value
      const url = formEdit.querySelector('[name="url"]').value
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
        if(e.target === el) {
          this.hide(el)
        }
      })
    })
  }

  initContextMenu() {
    let tab = null
    let id = null

    document.addEventListener('contextmenu', async(e) => {
      const tabItem = e.target.closest('.speed-dial__tabs-item')
      const search = e.target.closest('.speed-dial__search-input')
      let context = document.querySelector('.speed-dial__context-menu-page')

      if(search) {
        return false
      }

      e.preventDefault()

      if(tabItem) {
        context = document.querySelector('.speed-dial__context-menu-tab')
        id = tabItem.getAttribute('data-id')
      }

      context.style.top = (e.clientY + context.clientHeight >= screen.height) ? `${e.clientY - context.clientHeight}px` : `${e.clientY}px`
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
          const formEdit = document.querySelector('.speed-dial__modal-edit form')
          formEdit.querySelector('[name="id"]').value = tab.id
          formEdit.querySelector('[name="url"]').value = tab.url
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

  initSorting() {
    const dropZones = document.querySelectorAll('.speed-dial__tabs')
    const dragItems = document.querySelectorAll('.speed-dial__tabs-item')
    const newTab = document.querySelector('.speed-dial__tabs-item-new')
    let draggedItem = null
    let droppedItem = null

    dragItems.forEach((dragItem) => {
      dragItem.addEventListener('dragstart', () => {
        draggedItem = dragItem
        newTab.style.display = 'none'
      })

      dragItem.addEventListener('dragend', () => {
        draggedItem = null
        newTab.style.display = 'block'
      })

      dragItem.addEventListener('dragenter', (e) => {
        if(draggedItem !== droppedItem) {
          droppedItem = dragItem
        }

        e.preventDefault()
      })

      dragItem.addEventListener('dragleave', () => {
        droppedItem = null
      })
    })

    dropZones.forEach((dropZone) => {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault()
      })

      dropZone.addEventListener('drop', () => {
        if(droppedItem) {
          if(droppedItem.parentElement === draggedItem.parentElement) {
            const children = Array.from(droppedItem.parentElement.children)
            const draggedIndex = children.indexOf(draggedItem)
            const droppedIndex = children.indexOf(droppedItem)

            if(draggedIndex > droppedIndex) {
              draggedItem.parentElement.insertBefore(draggedItem, droppedItem)
            } else {
              draggedItem.parentElement.insertBefore(draggedItem, droppedItem.nextElementSibling)
            }
          } else {
            dropZone.insertBefore(draggedItem, droppedItem)
          }

          document.querySelectorAll('.speed-dial__tabs-item').forEach((tab, index) => {
            const id = tab.getAttribute('data-id')
            const position = index + 1

            this.setPosition(id, position)
          })
        }
      })
    })
  }

  initSearch() {
	  const form = document.querySelector('.speed-dial__search')
    const input = document.querySelector('.speed-dial__search-input')
    const button = document.querySelector('.speed-dial__search-button')
    const suggestions = document.querySelector('.speed-dial__search-suggestions')
    let suggestionsItems = ''
    let suggestionsActive = ''

    form.addEventListener('submit', (e) => {
      if(input.value === '') {
        e.preventDefault()
      }
    })

    input.addEventListener('input', async () => {
      const res = await fetch(`https://suggest.yandex.ru/suggest-sl?part=${input.value}`)
      const data = await res.json()

      button.disabled = (input.value === '')

      if(data[1].length) {
        suggestions.innerHTML = ''

        data[1].forEach((el) => {
          const item = document.createElement('div')

          item.classList.add('speed-dial__search-suggestions-item')
          item.innerHTML = el
          suggestions.appendChild(item)

          item.addEventListener('click', (e) => {
            input.value = e.target.innerHTML
            form.submit()
            this.hide(suggestions)
          })

          item.addEventListener('mouseenter', (e) => {
            suggestionsItems.forEach((el) => {
              el.classList.remove('speed-dial__search-suggestions-item--active')
            })

            e.target.classList.add('speed-dial__search-suggestions-item--active')
            suggestionsActive = e.target
          })

          item.addEventListener('mouseleave', () => {
            suggestionsItems.forEach((el) => {
              el.classList.remove('speed-dial__search-suggestions-item--active')
            })

            suggestionsActive = ''
          })
        })

        suggestionsItems = document.querySelectorAll('.speed-dial__search-suggestions-item')
        this.show(suggestions)
      }
    })

    input.addEventListener('focus', () => {
      if(input.value !== '') {
        this.show(suggestions)
      }
    })

    input.addEventListener('blur', () => {
      this.hide(suggestions)
    })

    document.addEventListener('keyup', (e) => {
      if(getComputedStyle(suggestions).display === 'block') {
        if(e.key === 'ArrowUp') {
          if(!suggestionsActive) {
            suggestionsActive = suggestions.lastChild
          } else {
            suggestionsActive.classList.remove('speed-dial__search-suggestions-item--active')
            suggestionsActive = (suggestionsActive.previousElementSibling) ? suggestionsActive.previousElementSibling : suggestions.lastChild
          }

          suggestionsActive.classList.add('speed-dial__search-suggestions-item--active')
          input.value = suggestionsActive.innerHTML
        }

        if(e.key === 'ArrowDown') {
          if(!suggestionsActive) {
            suggestionsActive = suggestions.firstChild
          } else {
            suggestionsActive.classList.remove('speed-dial__search-suggestions-item--active')
            suggestionsActive = (suggestionsActive.nextElementSibling) ? suggestionsActive.nextElementSibling : suggestions.firstChild
          }

          suggestionsActive.classList.add('speed-dial__search-suggestions-item--active')
          input.value = suggestionsActive.innerHTML
        }
      }
    })
  }
}

const SD = new SpeedDial()
