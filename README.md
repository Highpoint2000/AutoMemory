# Auto Memory
Automatic memory expansion for the FM-DX web server, which organizes received radio stations in an interactive gallery with logo support.

<img width="1191" height="866" alt="Screenshot 2026-04-27 150015" src="https://github.com/user-attachments/assets/65473a26-aab2-41e8-a805-0e92f358382f" />


## Version 1.0

- Signal-Priority Memory: Automatically detects and stores radio stations, ensuring only the frequency with the strongest signal is saved for each unique PI code
- Persistent Position Logic: Maintains the exact grid position of every station even after signal loss or manual deletion, allowing it to reappear in the same slot upon re-reception
- Interactive Station Gallery: Features a dynamic, zoomable UI with fluid drag-and-drop sorting and a two-stage signal loss system (grayscale fading before final removal)
- Live Metadata Tooltips: Displays real-time station information, including city, ERP, distance, and PI code, which updates instantly while hovering over a logo

## Installation notes

1. 	Download the last repository as a zip
2.	Unpack the AutoMemoryPlugin.js and the AutoMemory folder with the automemory.js into the web server plugins folder (..fm-dx-webserver-main\plugins)
3. 	Restart the server
4. 	Activate the plugin it in the settings
5.  Enable autostart in the settings and/or adjust the brightness

## How to use

- Simply tune to any frequency; the plugin automatically identifies valid radio signals and adds them to your gallery once a stable RDS name is received
- Adjust the size of all logos and boxes on the fly by holding STRG/CTRL while scrolling the mouse wheel over the gallery—your preferred size is saved automatically
- Press and hold any logo for 1 second to enter Edit Mode (Wiggle Mode). You can then drag and drop stations to any position or click the red "X" to remove a specific entry
- Hover your mouse over any logo to see a real-time tooltip containing technical details such as the PI Code, transmitter city, ERP power, and distance
- Stations that lose their signal will first turn grayscale (Stage 1) after 10 seconds of silence, and will only be fully removed from the gallery if the signal remains lost for another 10 seconds
- While in Edit Mode, use the "X" button at the top right of the gallery container to wipe the entire memory and start fresh
- Use the "Hide Auto Memory" toggle in the webserver's side settings menu to show or hide the entire gallery component at any time
  
## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://tef.noobish.eu/logos/images/buymeacoffee/default-yellow.png" alt="Buy Me A Coffee" ></a>

<details>
<summary>History</summary>

