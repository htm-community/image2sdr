# image2sdr
NodeJS service to generate SDRs for images

------------
# AT A MINIMUM

Copy config_example.yml into a file named config.yml

Enter your Cortical.io and Clarifai API keys in config.yml

------------
# OTHER OPTIONS

The URLs to Retina and Clarifai APIs can be changed if they are running in another location.

The Retina name and Clarifai model can be changed

The sparsity of the generated SDRs can be changed from default 0.02 (if set to 1, generates union SDRs)

The listening port can be modified

Dockerfile is included for running service in a container

Set Environment to "Production" to disable verbose logging

------------
TODO: Support proxy config

------------
# ROUTES

# [POST] /

Expects an image file attachment, and returns an SDR.

HTTP code 200 indicates success.

Response is in JSON format: { sdr: [] }