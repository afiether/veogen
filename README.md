# VeoGen - video creation for nerds
Not bragging about this tool being the next generation thingie, but I find it useful in my situation so I decided to publish it.
Veogen is designed to help you generate videos (both HD and reels) by simply letting you code everything in a yml project file.
It supports text to speech, showcase videos and images, backgrounds, titles and captions.

## OS dependencies
Make sure to install ffmpeg and xvfb
`sudo apt install ffmpeg xvfb`

Of course you'll need NodeJS, I use v20.20.2
And Yarn package manager:
`npm install -g corepack`
Run the `yarn` command, you'll be prompted to install it.

For text to speech, you'll need to install Docker. Then you need to run this compose command in the _infra_ folder:
`docker compose up -d`

### NVIDIA optimization
With docker, you may have some issues with NVIDIA graphics cards, but follow these steps to configure it.
Install NVIDIA container toolkit: (https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

`sudo nvidia-ctk runtime configure --runtime=docker`
Add yourself to the docker group
`usermod -aG docker yourself`
`sudo service docker restart`

Check with:
`sudo docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi`

## Start Veogen
Just run `yarn app` and your app will start. Projects are defined in the ./veogen/projects folder.